import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { query } from "./db.js";

const server = new McpServer({ name: "learnhub", version: "1.0.0" });

const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
});
const wrap = <T>(fn: (a: T) => Promise<unknown>) => async (a: T) => {
  try { return ok(await fn(a)); } catch (e) { return fail(e); }
};

server.tool("list_tables", "List LearnHub tables with row counts.", {}, wrap(async () =>
  query(
    "SELECT table_name AS `table`, table_rows AS approx_rows FROM information_schema.tables WHERE table_schema = 'learnhub' ORDER BY table_name",
  ),
));

server.tool(
  "describe_table",
  "Describe columns and keys of a LearnHub table.",
  { table: z.string().regex(/^[A-Za-z0-9_]+$/) },
  wrap(async ({ table }) => {
    const rows = await query(
      "SELECT column_name AS name, column_type AS type, is_nullable AS nullable, column_key AS `key`, column_default AS `default` FROM information_schema.columns WHERE table_schema = 'learnhub' AND table_name = ? ORDER BY ordinal_position",
      [table],
    );
    if (!rows.length) throw new Error(`Unknown table: ${table}`);
    return rows;
  }),
);

server.tool(
  "run_query",
  "Run a single read-only SELECT/WITH query (row-capped).",
  { sql: z.string().min(1), limit: z.number().int().min(1).max(1000).default(200) },
  wrap(async ({ sql, limit }) => {
    const s = sql.trim().replace(/;+\s*$/, "");
    if (!/^(select|with)\b/i.test(s)) throw new Error("Only SELECT/WITH queries are allowed.");
    if (s.includes(";")) throw new Error("Multiple statements are not allowed.");
    if (/\b(into\s+(outfile|dumpfile)|for\s+update|sleep\s*\()/i.test(s))
      throw new Error("Query contains a disallowed construct.");
    return query(`SELECT * FROM (${s}) AS q LIMIT ${limit}`);
  }),
);

server.tool(
  "get_course",
  "Course details with instructor, lesson count, enrollments and average rating.",
  { course_id: z.number().int() },
  wrap(async ({ course_id }) => {
    const rows = await query(
      `SELECT c.*, i.full_name AS instructor,
         (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
         (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrollments,
         (SELECT AVG(r.stars) FROM reviews r WHERE r.course_id = c.id) AS avg_rating
       FROM courses c JOIN instructors i ON i.id = c.instructor_id WHERE c.id = ?`,
      [course_id],
    );
    if (!rows.length) throw new Error("Course not found");
    return rows[0];
  }),
);

server.tool(
  "get_student",
  "Student profile with enrollments (progress %), orders and reviews.",
  { student_id: z.number().int() },
  wrap(async ({ student_id }) => {
    const [student] = await query("SELECT * FROM students WHERE id = ?", [student_id]);
    if (!student) throw new Error("Student not found");
    const enrollments = await query(
      `SELECT e.course_id, c.title, e.enrolled_at,
         ROUND(100 * (SELECT COUNT(*) FROM lesson_progress p WHERE p.student_id = e.student_id AND p.course_id = e.course_id)
           / NULLIF((SELECT COUNT(*) FROM lessons l WHERE l.course_id = e.course_id), 0), 1) AS progress_pct
       FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.student_id = ?`,
      [student_id],
    );
    const orders = await query(
      "SELECT id, coupon_code, total, status, created_at FROM orders WHERE student_id = ?",
      [student_id],
    );
    const reviews = await query(
      "SELECT course_id, stars, comment, created_at FROM reviews WHERE student_id = ?",
      [student_id],
    );
    return { student, enrollments, orders, reviews };
  }),
);

server.tool(
  "list_refunds",
  "Refunds audited against the refund policy: exact days from order to refund, the maximum per-course progress across the order's courses (progress_pct), and violates_policy (1 if refunded after 7 days or progress >= 30%).",
  {
    within_days: z.number().int().optional().describe("Only refunds made within N days of the order (days_to_refund <= N)"),
    max_progress: z.number().optional().describe("Only refunds where max per-course progress % <= this"),
    only_violations: z.boolean().optional().describe("Only refunds that violate the refund policy"),
  },
  wrap(async ({ within_days, max_progress, only_violations }) => {
    const rows = await query(
      `SELECT r.id AS refund_id, r.order_id, o.student_id, r.amount, r.reason,
         o.created_at AS ordered_at, r.refunded_at, o.coupon_code,
         ROUND(TIMESTAMPDIFF(MINUTE, o.created_at, r.refunded_at) / 1440, 2) AS days_to_refund,
         ROUND(COALESCE(pp.max_pct, 0), 1) AS progress_pct,
         CASE WHEN TIMESTAMPDIFF(MINUTE, o.created_at, r.refunded_at) / 1440 > 7
                OR COALESCE(pp.max_pct, 0) >= 30 THEN 1 ELSE 0 END AS violates_policy
       FROM refunds r
       JOIN orders o ON o.id = r.order_id
       LEFT JOIN (
         SELECT ol.order_id, MAX(100 * COALESCE(pc.done, 0) / NULLIF(lc.total, 0)) AS max_pct
         FROM order_lines ol
         JOIN orders o2 ON o2.id = ol.order_id
         LEFT JOIN (
           SELECT student_id, course_id, COUNT(*) AS done FROM lesson_progress GROUP BY student_id, course_id
         ) pc ON pc.student_id = o2.student_id AND pc.course_id = ol.course_id
         LEFT JOIN (
           SELECT course_id, COUNT(*) AS total FROM lessons GROUP BY course_id
         ) lc ON lc.course_id = ol.course_id
         GROUP BY ol.order_id
       ) pp ON pp.order_id = o.id
       ORDER BY r.refunded_at`,
    );
    return rows
      .map((r) => ({
        ...r,
        days_to_refund: Number(r.days_to_refund),
        progress_pct: Number(r.progress_pct),
        violates_policy: Number(r.violates_policy),
      }))
      .filter(
        (r) =>
          (within_days === undefined || r.days_to_refund <= within_days) &&
          (max_progress === undefined || r.progress_pct <= max_progress) &&
          (!only_violations || r.violates_policy === 1),
      );
  }),
);

server.tool(
  "coupon_usage",
  "Coupon usage: recorded used_count vs actual orders, max_uses, and students using it more than once.",
  { code: z.string().optional() },
  wrap(async ({ code }) =>
    query(
      `SELECT c.code, c.max_uses, c.used_count, c.expires_on,
         COUNT(o.id) AS actual_orders,
         COUNT(DISTINCT o.student_id) AS distinct_students,
         COUNT(o.id) - COUNT(DISTINCT o.student_id) AS repeat_uses
       FROM coupons c LEFT JOIN orders o ON o.coupon_code = c.code
       WHERE (? IS NULL OR c.code = ?)
       GROUP BY c.code, c.max_uses, c.used_count, c.expires_on`,
      [code ?? null, code ?? null],
    ),
  ),
);

server.tool(
  "instructor_payouts",
  "Expected instructor payout = 70% of net sales (order line final_price, excluding refunded orders).",
  { instructor_id: z.number().int().optional() },
  wrap(async ({ instructor_id }) =>
    query(
      `SELECT i.id AS instructor_id, i.full_name,
         ROUND(SUM(CASE WHEN o.status = 'Paid' THEN ol.final_price ELSE 0 END), 2) AS net_sales,
         ROUND(0.7 * SUM(CASE WHEN o.status = 'Paid' THEN ol.final_price ELSE 0 END), 2) AS expected_payout
       FROM instructors i
       JOIN courses c ON c.instructor_id = i.id
       JOIN order_lines ol ON ol.course_id = c.id
       JOIN orders o ON o.id = ol.order_id
       WHERE (? IS NULL OR i.id = ?)
       GROUP BY i.id, i.full_name ORDER BY i.id`,
      [instructor_id ?? null, instructor_id ?? null],
    ),
  ),
);

server.tool(
  "at_risk_students",
  "Enrolled students with no lesson progress in the last N days.",
  { min_days_inactive: z.number().int().default(30) },
  wrap(async ({ min_days_inactive }) => {
    const now = process.env.LEARNHUB_NOW ? new Date(process.env.LEARNHUB_NOW) : new Date();
    return query(
      `SELECT s.id AS student_id, s.full_name, s.email,
         COUNT(DISTINCT e.course_id) AS courses_enrolled,
         MAX(p.completed_at) AS last_activity,
         DATEDIFF(?, MAX(p.completed_at)) AS days_inactive
       FROM students s
       JOIN enrollments e ON e.student_id = s.id
       LEFT JOIN lesson_progress p ON p.student_id = s.id
       GROUP BY s.id, s.full_name, s.email
       HAVING last_activity IS NULL OR days_inactive >= ?
       ORDER BY days_inactive DESC LIMIT 200`,
      [now, min_days_inactive],
    );
  }),
);

await server.connect(new StdioServerTransport());
console.error("learnhub MCP server running on stdio");
