const EN: Record<string, string> = {
  "طلب غير صالح": "Invalid request.",
  "بيانات غير صالحة": "Invalid details.",
  "كلمة المرور غير صحيحة": "Incorrect password.",
  "كلمة المرور الحالية غير صحيحة": "Incorrect current password.",
  "بيانات الدخول غير صحيحة": "Incorrect sign-in details.",
  "بيانات تحقق غير صالحة": "Invalid verification details.",
  "المستخدم غير موجود": "User not found.",
  "الإعلان غير موجود": "Listing not found.",
  "المزاد غير موجود": "Auction not found.",
  "المعاملة غير موجودة": "Transaction not found.",
  "المعاملة مغلقة": "This transaction is closed.",
  "سبق أن أجبت على هذه المعاملة": "You have already answered this transaction.",
  "سبق تأكيد المعاملة أو انتهت مهلة التأكيد":
    "This transaction was already answered or its deadline has passed.",
  "إجابة غير صالحة": "Invalid answer.",
  "رسالة غير صالحة": "Invalid message.",
  "اكتب رسالة أو أرفق صورة": "Write a message or attach an image.",
  "الرسالة أطول من الحد المسموح": "Your message exceeds the length limit.",
  "رسالتك تحتوي محتوى مخالفاً لسياسات المنصة": "This message violates the platform rules.",
  "لا يمكن إرسال رسائل في هذه المحادثة": "You cannot send messages in this conversation.",
  "المراسلة غير متاحة بين هذين الحسابين": "Messaging is unavailable between these accounts.",
  "الإعلان غير متاح للمراسلة": "Messaging is unavailable for this listing.",
  "حدد الطرف الآخر للمحادثة": "Choose the other participant.",
  "لا توجد علاقة لهذا المستخدم بالإعلان": "This user has no existing connection to this listing.",
  "سجّل دخولك للمراسلة": "Sign in to send messages.",
  "سجّل دخولك للمزايدة": "Sign in to bid.",
  "سجّل دخولك أولاً": "Please sign in first.",
  "خدمة التحقق بالبريد غير متاحة": "Email verification is currently unavailable.",
  "لا يمكن تغيير البريد لأن خدمة التحقق غير متاحة":
    "Email verification must be available to change your email.",
  "هذا البريد مستخدم في حساب آخر": "This email is used by another account.",
  "رقم الجوال مستخدم في حساب آخر": "This phone number is used by another account.",
  "أدخل كلمة المرور الحالية لتغيير البريد الإلكتروني":
    "Enter your current password to change your email.",
  "تغير الحساب؛ اطلب تحققًا جديدًا": "Your account changed. Request a new verification code.",
  "انتهى التحقق أو تغير الحساب؛ حاول مجددًا":
    "Verification expired or your account changed. Please try again.",
  "حجم الصورة يتجاوز 5 ميجابايت": "Image size exceeds 5 MB.",
  "الملف ليس صورة صالحة": "This file is not a valid image.",
  "صيغة صورة غير مدعومة — استخدم JPG أو PNG أو WebP": "Use a JPG, PNG or WebP image.",
  "تعذّرت معالجة الصورة — جرّب صورة أخرى": "This image could not be processed. Try another image.",
  "تعذّر حفظ الصورة — حاول مجدداً": "Unable to save the image. Please try again.",
  "مبلغ غير صالح": "Invalid amount.",
  "انتهى هذا المزاد ولا يقبل مزايدات جديدة": "This auction has closed and no longer accepts bids.",
  "لا يمكنك المزايدة على مزادك الخاص": "You cannot bid on your own auction.",
  "حظرك صاحب المزاد من المزايدة في هذا المزاد": "The seller has blocked your bids in this auction.",
  "الحساب غير مصرح له": "This account is not allowed to perform this action.",
  "المزاد لا يقبل تعديل الوكالة": "Proxy bids cannot be changed for this auction.",
  "مزوّد غير مدعوم": "Unsupported provider.",
  "هذا الحساب محظور.": "This account is banned.",
  "غير مصرح": "Unauthorized.",
  "الملف غير موجود": "File not found.",
  "لا يمكن حذف حساب مدير — أزل صلاحية الإدارة أولاً":
    "Remove the administrator role before deleting this account.",
  "مصداقية حسابك منخفضة بسبب صفقات سابقة لم تكتمل — لا يمكنك المزايدة حالياً":
    "Your credibility is too low after unfinished deals, so bidding is paused for now.",
  "لديك مزادات فزت بها ولم تكتمل بعد — أكمل استلامها أولاً ثم زايد من جديد":
    "Complete the auctions you already won before placing new bids.",
  "لا يمكن حظر المزايدين في آخر 10 دقائق من المزاد — تواصل مع الدعم إن كانت هناك مخالفة":
    "Bidders cannot be blocked in the final 10 minutes. Contact support about violations.",
  "نشرت إعلانات كثيرة خلال وقت قصير — انتظر قليلاً":
    "You have published too many listings. Please wait.",
};
export function apiMessage(req: Request, message: unknown): string {
  const text = typeof message === "string" ? message : "طلب غير صالح";
  const english = /(?:^|;\s*)samel_lang=en(?:;|$)/.test(req.headers.get("cookie") ?? "");
  if (!english) return text;
  if (EN[text]) return EN[text];
  if (!/[\u0600-\u06ff]/.test(text)) return text;
  return "Unable to complete this request. Check the details and try again.";
}
