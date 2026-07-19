import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimitGuard, isRateLimited } from "@/lib/rate-limit";

/**
 * AI listing writer (PRO): the seller types a rough line («كامري 2020 فل كامل
 * ماشية 80 ألف») and gets back a market-ready title + description in Arabic.
 * Biggest friction-remover in publishing — and a real reason to go PRO.
 */

const bodySchema = z.object({
  hint: z.string().min(5).max(500),
  categoryId: z.string().min(1),
  goal: z.enum(["SELL", "AUCTION", "ANNOUNCE"]).default("SELL"),
  // current form values, merged into the prompt so the output stays consistent
  attributes: z.record(z.string(), z.string()).optional(),
});

const OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    title: {
      type: "string" as const,
      description: "عنوان إعلان جذاب ودقيق، 30–90 حرفاً، يذكر الماركة/الموديل/السنة إن وُجدت، بدون مبالغات",
    },
    description: {
      type: "string" as const,
      description:
        "وصف إعلان عربي واضح 300–900 حرف: الحالة، أبرز المواصفات، الملحقات، سبب البيع إن ذُكر، وطريقة التواصل تُترك للمنصة. بدون معلومات مخترعة وبدون أرقام هواتف",
    },
  },
  required: ["title", "description"],
  additionalProperties: false,
};

export async function POST(req: Request) {
  const limited = await rateLimitGuard(req, "ai-describe", 10, 60_000);
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "سجّل دخولك أولاً" }, { status: 401 });
  if (!user.isPro) {
    return NextResponse.json(
      { error: "كتابة الوصف بالذكاء الاصطناعي ميزة لمشتركي برو" },
      { status: 403 }
    );
  }
  // PRO or not, cap the spend per account
  if (await isRateLimited(`ai-describe:${user.id}`, 20, 24 * 3_600_000)) {
    return NextResponse.json(
      { error: "وصلت لحد الاستخدام اليومي لهذه الميزة — جرّب غداً" },
      { status: 429 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "الميزة غير مفعّلة حالياً" }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "اكتب وصفاً مختصراً للسلعة (5 أحرف على الأقل) ليساعدك الذكاء الاصطناعي" },
      { status: 400 }
    );
  }
  const { hint, categoryId, goal, attributes } = parsed.data;

  const category = await db.category.findUnique({
    where: { id: categoryId },
    include: { parent: true },
  });
  if (!category) return NextResponse.json({ error: "فئة غير موجودة" }, { status: 400 });

  const attrText = attributes
    ? Object.entries(attributes)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => `${k}: ${v}`)
        .join("، ")
    : "";

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      system:
        "أنت مساعد كتابة إعلانات في «حراج ستيشن»، سوق سعودي للإعلانات المبوبة. " +
        "تكتب عنواناً ووصفاً عربياً واضحاً وصادقاً انطلاقاً مما يذكره البائع فقط — " +
        "لا تخترع مواصفات أو حالة أو ملحقات لم تُذكر، ولا تكتب أرقام تواصل أو روابط أو أسعار لم يذكرها البائع. " +
        "استخدم لغة عربية فصيحة مبسطة يفهمها الجميع، وقسّم الوصف لسطور قصيرة سهلة القراءة.",
      messages: [
        {
          role: "user",
          content:
            `الفئة: ${category.parent ? `${category.parent.nameAr} — ` : ""}${category.nameAr}\n` +
            `نوع الإعلان: ${goal === "AUCTION" ? "مزاد" : goal === "ANNOUNCE" ? "إعلان/خدمة" : "بيع"}\n` +
            (attrText ? `مواصفات أدخلها البائع: ${attrText}\n` : "") +
            `وصف البائع المختصر: ${hint}`,
        },
      ],
    });

    if (response.stop_reason === "refusal" || response.content.length === 0) {
      return NextResponse.json(
        { error: "تعذّر توليد الوصف لهذا المحتوى — اكتبه يدوياً" },
        { status: 422 }
      );
    }
    const textBlock = response.content.find((b) => b.type === "text");
    const out = textBlock ? JSON.parse(textBlock.text) : null;
    if (!out?.title || !out?.description) {
      return NextResponse.json({ error: "حدث خطأ — أعد المحاولة" }, { status: 502 });
    }
    return NextResponse.json({
      title: String(out.title).slice(0, 100),
      description: String(out.description).slice(0, 5000),
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "الخدمة مشغولة — أعد المحاولة بعد قليل" }, { status: 429 });
    }
    console.error("ai-describe:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "حدث خطأ — أعد المحاولة" }, { status: 502 });
  }
}
