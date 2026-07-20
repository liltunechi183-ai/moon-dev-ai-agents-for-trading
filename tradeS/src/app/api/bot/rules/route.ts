import { NextResponse } from "next/server";
import { z } from "zod";
import { db, tables } from "@/lib/db";
import { RuleConditionSchema, RuleActionSchema } from "@/lib/bot/rules";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(db.select().from(tables.botRules).all());
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  condition: RuleConditionSchema,
  action: RuleActionSchema,
  enabled: z.boolean().default(true),
});

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const now = Date.now();
  const [rule] = db
    .insert(tables.botRules)
    .values({ ...parsed.data, version: 1, createdAt: now })
    .returning()
    .all();
  db.insert(tables.botRuleVersions)
    .values({
      ruleId: rule.id,
      version: 1,
      name: rule.name,
      condition: rule.condition,
      action: rule.action,
      createdAt: now,
    })
    .run();
  return NextResponse.json(rule, { status: 201 });
}
