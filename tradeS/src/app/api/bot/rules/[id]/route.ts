import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { RuleConditionSchema, RuleActionSchema } from "@/lib/bot/rules";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  condition: RuleConditionSchema.optional(),
  action: RuleActionSchema.optional(),
  enabled: z.boolean().optional(),
});

/** Edits to condition/action bump the version and append to the history
 * table so trades stay attributed to the params at fire time. A bare
 * enabled toggle does not bump. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNum = Number(id);
  const parsed = patchSchema.safeParse(await request.json());
  if (!Number.isInteger(idNum) || !parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const [rule] = db.select().from(tables.botRules).where(eq(tables.botRules.id, idNum)).limit(1).all();
  if (!rule) return NextResponse.json({ error: "not found" }, { status: 404 });

  const changesParams =
    parsed.data.condition !== undefined || parsed.data.action !== undefined || parsed.data.name !== undefined;
  const newVersion = changesParams ? rule.version + 1 : rule.version;

  const [updated] = db
    .update(tables.botRules)
    .set({
      name: parsed.data.name ?? rule.name,
      condition: parsed.data.condition ?? rule.condition,
      action: parsed.data.action ?? rule.action,
      enabled: parsed.data.enabled ?? rule.enabled,
      version: newVersion,
    })
    .where(eq(tables.botRules.id, idNum))
    .returning()
    .all();

  if (changesParams) {
    db.insert(tables.botRuleVersions)
      .values({
        ruleId: updated.id,
        version: newVersion,
        name: updated.name,
        condition: updated.condition,
        action: updated.action,
        createdAt: Date.now(),
      })
      .run();
  }
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  db.delete(tables.botRules).where(eq(tables.botRules.id, idNum)).run();
  return NextResponse.json({ ok: true });
}
