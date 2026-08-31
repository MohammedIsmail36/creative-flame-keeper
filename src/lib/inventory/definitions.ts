// ─── التعريفات الموحّدة لكل تقارير المخزون ───────────────────────────────────
// أي عتبة أو تصنيف يظهر للمستخدم يجب أن يأتي من هنا، ومعه شرح بالعامية
// حتى يعرف صاحب المتجر "على أي أساس" ظهرت له التوصية.

export const INVENTORY_RULES = {
  /** المنتج يُعتبر "جديد" ولا نحكم عليه قبل هذه المدة من أول حركة له */
  NEW_PRODUCT_DAYS: 30,
  /** بلا أي بيع لهذه المدة ومعه مخزون ⇒ راكد */
  DORMANT_DAYS: 60,
  /** أيام التغطية المستهدفة عند اقتراح كمية الشراء */
  COVERAGE_TARGET_DAYS: 30,
  /** تغطية أقل من هذا ⇒ شراء عاجل */
  URGENT_COVERAGE_DAYS: 15,
  /** نفد المخزون ولم يُشترَ منذ هذه المدة ⇒ فرصة بيع ضائعة */
  LOST_SALE_DAYS: 14,
  /** تغطية أكثر من هذا ⇒ مخزون فائض */
  OVERSTOCK_COVERAGE_DAYS: 180,
  /** حصة الإيراد التراكمي لفئة A ثم B (تصنيف ABC) */
  ABC_A_SHARE: 0.8,
  ABC_B_SHARE: 0.95,
  /** أقل فترة ملاحظة قبل اقتراح الإرجاع للمورد */
  SUPPLIER_RETURN_MIN_DAYS: 30,
  /** قيمة المخزون الراكد التي تستحق إجراء تسعير */
  STAGNANT_VALUE_THRESHOLD: 1000,
  /** نسبة المرتجعات التي تُعد مرتفعة */
  HIGH_RETURN_RATE: 0.3,
} as const;

/** شرح كل قاعدة بلغة صاحب المتجر — يُستخدم في التلميحات وأسطر "الأساس" */
export const RULE_EXPLANATIONS = {
  NEW_PRODUCT_DAYS: `المنتج الذي لم يمضِ على أول حركة له ${INVENTORY_RULES.NEW_PRODUCT_DAYS} يومًا لا نحكم عليه بعد.`,
  DORMANT_DAYS: `راكد = لديك منه مخزون ولم تبع منه أي وحدة خلال ${INVENTORY_RULES.DORMANT_DAYS} يومًا.`,
  COVERAGE_DAYS: "أيام التغطية = الكمية الحالية ÷ متوسط البيع اليومي.",
  SUGGESTED_QTY: `الكمية المقترحة = (متوسط البيع اليومي × ${INVENTORY_RULES.COVERAGE_TARGET_DAYS} يومًا) − الكمية الحالية.`,
  URGENT: `شراء عاجل = التغطية أقل من ${INVENTORY_RULES.URGENT_COVERAGE_DAYS} يومًا لمنتج من فئة A أو B.`,
  LOST_SALE: `فرصة بيع ضائعة = الصنف نفد، وله مبيعات سابقة، ولم تُعِد شراءه منذ ${INVENTORY_RULES.LOST_SALE_DAYS} يومًا.`,
  OVERSTOCK: `مخزون فائض = التغطية تفوق ${INVENTORY_RULES.OVERSTOCK_COVERAGE_DAYS} يومًا.`,
  ABC: `A = أعلى المنتجات التي تصنع ${INVENTORY_RULES.ABC_A_SHARE * 100}% من إيرادك، B حتى ${INVENTORY_RULES.ABC_B_SHARE * 100}%، والباقي C.`,
  SUPPLIER_RETURN: `يُقترح الإرجاع للمورد بعد ${INVENTORY_RULES.SUPPLIER_RETURN_MIN_DAYS} يومًا من الملاحظة، ويُستثنى الموسمي وما بِيع في نفس فترة العام الماضي.`,
  WAC: "تكلفة الوحدة = المتوسط المرجّح للتكلفة من حركات المخزون (نفس أساس حساب المخزون 1104).",
  FROZEN_CAPITAL: "الأموال المجمّدة = كمية المخزون × تكلفة الوحدة للأصناف الراكدة أو التي لم تُبَع.",
  GL_VARIANCE:
    "الفرق = قيمة المخزون من الحركات (كمية × تكلفة) ناقص رصيد حساب المخزون 1104 في دفتر الأستاذ. يظهر الفرق عادة من قيد محاسبي يدوي على 1104 أو فرق سعر شراء لم يقابله حركة مخزون.",
} as const;

/** الإجراء المقترح على مستوى الصنف — قائمة مغلقة حتى لا تتكرر الصياغات */
export type InventoryAction =
  | "buy_now"
  | "buy_soon"
  | "supplier_return"
  | "discount"
  | "reduce_orders"
  | "fix_pricing"
  | "deactivate"
  | "watch"
  | "keep";

export const ACTION_LABELS: Record<InventoryAction, string> = {
  buy_now: "اشترِ الآن",
  buy_soon: "جدوِل الشراء",
  supplier_return: "أرجِع للمورد",
  discount: "خفّض السعر / عرض",
  reduce_orders: "قلّل كمية الطلب",
  fix_pricing: "صحّح التسعير",
  deactivate: "أوقف الصنف",
  watch: "راقب فقط",
  keep: "استمر كما هو",
};

export const ACTION_TONE: Record<
  InventoryAction,
  "danger" | "warning" | "info" | "success"
> = {
  buy_now: "danger",
  buy_soon: "warning",
  supplier_return: "danger",
  discount: "warning",
  reduce_orders: "warning",
  fix_pricing: "warning",
  deactivate: "info",
  watch: "info",
  keep: "success",
};
