import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, tables } from "@/lib/db";
import { RuleConditionSchema, RuleActionSchema } from "@/lib/bot/rules";

const schema = z.object({ action: z.enum(["apply", "dismiss"]) });

/** Apply routes the suggested params through the normal versioned rule edit
 * (bumps the rule version + appends history); Dismiss just closes it.
 * The advisor NEVER auto-applies — this human click is the gate. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNum = Number(id);
  const parsed = schema.safeParse(await request.json());
  if (!Number.isInteger(idNum) || !parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const [suggestion] = db
    .select()
    .from(tables.ruleSuggestions)
    .where(eq(tables.ruleSuggestions.id, idNum))
    .limit(1)
    .all();
  if (!suggestion) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (suggestion.status !== "pending") {
    return NextResponse.json({ error: "already resolved" }, { status: 409 });
  }

  if (parsed.data.action === "dismiss") {
    db.update(tables.ruleSuggestions)
      .set({ status: "dismissed", resolvedAt: Date.now() })
      .where(eq(tables.ruleSuggestions.id, idNum))
      .run();
    return NextResponse.json({ ok: true });
  }

  // Apply: validate the suggested params, then edit the rule the versioned way.
  const condOk = RuleConditionSchema.safeParse(suggestion.suggestedCondition);
  const actionOk = RuleActionSchema.safeParse(suggestion.suggestedAction);
  if (!condOk.success || !actionOk.success || suggestion.ruleId == null) {
    return NextResponse.json({ error: "suggested params no longer valid" }, { status: 400 });
  }
  const [rule] = db.select().from(tables.botRules).where(eq(tables.botRules.id, suggestion.ruleId)).limit(1).all();
  if (!rule) return NextResponse.json({ error: "rule gone" }, { status: 404 });

  const newVersion = rule.version + 1;
  const now = Date.now();
  db.transaction((tx) => {
    tx.update(tables.botRules)
      .set({ condition: condOk.data, action: actionOk.data, version: newVersion })
      .where(eq(tables.botRules.id, rule.id))
      .run();
    tx.insert(tables.botRuleVersions)
      .values({
        ruleId: rule.id,
        version: newVersion,
        name: rule.name,
        condition: condOk.data,
        action: actionOk.data,
        createdAt: now,
      })
      .run();
    tx.update(tables.ruleSuggestions)
      .set({ status: "applied", resolvedAt: now })
      .where(eq(tables.ruleSuggestions.id, idNum))
      .run();
  });

  return NextResponse.json({ ok: true, newVersion });
}
