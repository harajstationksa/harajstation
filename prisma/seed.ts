import { PrismaClient, User } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { maskedBidderName } from "../src/lib/utils";
import { buildSearchText, normalizeArabic } from "../src/lib/arabic";

const db = new PrismaClient();

const img = (...keys: string[]) =>
  JSON.stringify(keys.map((k) => `/images/ph/${k}.svg`));
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);

async function main() {
  // wipe (children → parents)
  await db.pointTransaction.deleteMany();
  await db.pointPackage.deleteMany();
  await db.setting.deleteMany();
  await db.campaign.deleteMany();
  await db.listingView.deleteMany();
  await db.review.deleteMany();
  await db.report.deleteMany();
  await db.comment.deleteMany();
  await db.store.deleteMany();
  await db.plan.deleteMany();
  await db.bannedWord.deleteMany();
  await db.evidence.deleteMany();
  await db.dispute.deleteMany();
  await db.transaction.deleteMany();
  await db.bid.deleteMany();
  await db.auction.deleteMany();
  await db.favorite.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.notification.deleteMany();
  await db.credibilityLog.deleteMany();
  await db.auditLog.deleteMany();
  await db.banner.deleteMany();
  await db.listing.deleteMany();
  await db.category.deleteMany();
  await db.user.deleteMany();

  const pass = hashSync("password123", 10);

  // ─── Users ───
  await db.user.create({
    data: {
      name: "إدارة حراج ستيشن",
      phone: "+966500000001",
      email: "admin@samel.sa",
      passwordHash: hashSync("admin123", 10),
      city: "الرياض",
      role: "ADMIN",
      credibility: 100,
      avatarColor: "#171717",
    },
  });
  await db.user.create({
    data: {
      name: "فريق دعم حراج ستيشن",
      phone: "+966500000002",
      email: "support@samel.sa",
      passwordHash: hashSync("support123", 10),
      city: "الرياض",
      role: "SUPPORT",
      credibility: 100,
      avatarColor: "#2563eb",
    },
  });
  const demo = await db.user.create({
    data: {
      name: "محمد العمري",
      phone: "+966501234567",
      phoneVerified: true,
      email: "demo@samel.sa",
      passwordHash: hashSync("demo1234", 10),
      city: "الرياض",
      credibility: 87,
      successfulTx: 23,
      points: 250,
      isPro: true,
      avatarColor: "#db7759",
      createdAt: hoursAgo(24 * 400),
    },
  });

  const seedUsers: [string, string, number, string][] = [
    ["أحمد الشهري", "جدة", 78, "#0ea5e9"],
    ["سارة القحطاني", "الرياض", 91, "#8b5cf6"],
    ["خالد العتيبي", "الدمام", 66, "#f59e0b"],
    ["نورة الدوسري", "الرياض", 84, "#ec4899"],
    ["فهد الحربي", "جدة", 72, "#10b981"],
    ["عبدالله الغامدي", "مكة المكرمة", 58, "#6366f1"],
    ["ريم الزهراني", "الخبر", 88, "#14b8a6"],
    ["سلطان المطيري", "بريدة", 75, "#db7759"],
    ["لطيفة العنزي", "تبوك", 45, "#a855f7"],
    ["ماجد الشمري", "حائل", 69, "#ef4444"],
    ["هند السبيعي", "الرياض", 52, "#22c55e"],
  ];
  const pool: User[] = [];
  for (let i = 0; i < seedUsers.length; i++) {
    const [name, city, cred, color] = seedUsers[i];
    pool.push(
      await db.user.create({
        data: {
          name,
          city,
          credibility: cred,
          avatarColor: color,
          email: `user${i + 1}@samel.sa`,
          phone: `+96650123${1000 + i}`,
          phoneVerified: true,
          passwordHash: pass,
          successfulTx: Math.floor(cred / 6),
          points: 40 + i * 15,
          isPro: i % 4 === 0,
          createdAt: hoursAgo(24 * (30 + i * 17)),
        },
      })
    );
  }
  const [ahmed, sara, khalid, noura, fahad, abdullah, reem, sultan, , majed, hind] = pool;

  // ─── Categories — full Saudi market taxonomy (spec §4) ───
  const cats: [string, string, string, string, [string, string, string][]][] = [
    ["cars", "سيارات ومركبات", "Vehicles", "car", [
      ["cars-sale", "سيارات للبيع", "Cars for Sale"],
      ["cars-rent", "سيارات للإيجار", "Cars for Rent"],
      ["classic-cars", "سيارات كلاسيكية", "Classic Cars"],
      ["motorcycles", "دراجات نارية", "Motorcycles"],
      ["trucks", "شاحنات ومعدات ثقيلة", "Trucks & Heavy Equipment"],
      ["boats", "قوارب ويخوت", "Boats & Yachts"],
      ["auto-parts", "قطع غيار", "Auto Parts"],
      ["plates", "لوحات مميزة", "License Plates"],
      ["vip-numbers", "أرقام مميزة", "VIP Phone Numbers"],
    ]],
    ["realestate", "عقارات", "Real Estate", "building", [
      ["apts-sale", "شقق للبيع", "Apartments for Sale"],
      ["apts-rent", "شقق للإيجار", "Apartments for Rent"],
      ["villas", "فلل للبيع", "Villas for Sale"],
      ["villas-rent", "فلل للإيجار", "Villas for Rent"],
      ["land", "أراضي للبيع", "Land for Sale"],
      ["commercial", "عمارات تجارية", "Commercial Buildings"],
      ["offices", "مكاتب", "Offices"],
      ["shops", "محلات تجارية", "Shops"],
      ["farms", "مزارع واستراحات", "Farms & Rest Houses"],
      ["rooms-rent", "غرف للإيجار", "Rooms for Rent"],
    ]],
    ["electronics", "إلكترونيات", "Electronics", "smartphone", [
      ["phones", "هواتف ذكية", "Smartphones"],
      ["tablets", "أجهزة لوحية", "Tablets"],
      ["laptops", "لابتوبات", "Laptops"],
      ["desktops", "كمبيوتر مكتبي", "Desktop Computers"],
      ["tvs", "شاشات وتلفزيونات", "TVs & Monitors"],
      ["gaming", "ألعاب فيديو", "Gaming"],
      ["cameras", "كاميرات", "Cameras"],
      ["audio", "سماعات وصوتيات", "Audio"],
      ["e-accessories", "إكسسوارات إلكترونية", "Electronic Accessories"],
    ]],
    ["furniture", "أثاث ومفروشات", "Furniture & Home", "sofa", [
      ["bedrooms", "غرف نوم", "Bedrooms"],
      ["living", "غرف معيشة", "Living Rooms"],
      ["kitchens", "مطابخ", "Kitchens"],
      ["office-furniture", "أثاث مكتبي", "Office Furniture"],
      ["appliances", "أجهزة منزلية", "Home Appliances"],
      ["decor", "ديكور وإضاءة", "Decor & Lighting"],
      ["garden", "حدائق ونباتات", "Gardens & Plants"],
    ]],
    ["fashion", "أزياء وإكسسوارات", "Fashion", "shirt", [
      ["mens-clothing", "ملابس رجالية", "Men's Clothing"],
      ["womens-clothing", "ملابس نسائية", "Women's Clothing"],
      ["kids-clothing", "ملابس أطفال", "Kids' Clothing"],
      ["shoes", "أحذية", "Shoes"],
      ["watches", "ساعات", "Watches"],
      ["bags", "حقائب", "Bags"],
      ["jewelry", "مجوهرات", "Jewelry"],
      ["eyewear", "نظارات", "Eyewear"],
      ["perfumes", "عطور", "Perfumes"],
    ]],
    ["services", "خدمات", "Services", "wrench", [
      ["home-services", "خدمات منزلية", "Home Services"],
      ["digital", "خدمات إلكترونية", "Digital Services"],
      ["tutoring", "دروس وتعليم", "Tutoring & Education"],
      ["business-services", "خدمات تجارية", "Business Services"],
      ["auto-services", "خدمات سيارات", "Auto Services"],
      ["other-services", "خدمات أخرى", "Other Services"],
    ]],
    ["animals", "حيوانات", "Pets & Animals", "paw", [
      ["cats", "قطط", "Cats"],
      ["birds", "طيور", "Birds"],
      ["falcons", "صقور", "Falcons"],
      ["fish", "أسماك", "Fish"],
      ["camels", "إبل", "Camels"],
      ["horses", "خيول", "Horses"],
      ["sheep", "أغنام وماعز", "Sheep & Goats"],
      ["pet-supplies", "مستلزمات حيوانات", "Pet Supplies"],
      ["other-animals", "حيوانات أخرى", "Other Animals"],
    ]],
    ["sports", "رياضة وهوايات", "Sports & Hobbies", "dumbbell", [
      ["gym", "معدات رياضية", "Sports Equipment"],
      ["bicycles", "دراجات هوائية", "Bicycles"],
      ["camping", "رحلات وتخييم", "Camping & Outdoor"],
      ["music", "آلات موسيقية", "Musical Instruments"],
      ["books", "كتب", "Books"],
      ["antiques", "تحف ومقتنيات", "Antiques & Collectibles"],
      ["toys", "ألعاب أطفال", "Kids' Toys"],
    ]],
    ["business", "تجارة وصناعة", "Business & Industrial", "factory", [
      ["industrial", "معدات صناعية", "Industrial Equipment"],
      ["restaurant-equip", "معدات مطاعم", "Restaurant Equipment"],
      ["construction", "مواد بناء", "Construction Materials"],
      ["wholesale", "تجارة جملة", "Wholesale"],
      ["businesses-sale", "مشاريع تجارية للبيع", "Businesses for Sale"],
      ["medical-equip", "معدات طبية", "Medical Equipment"],
    ]],
    ["jobs", "وظائف", "Jobs", "briefcase", [
      ["full-time", "دوام كامل", "Full-time Jobs"],
      ["part-time", "دوام جزئي", "Part-time Jobs"],
      ["remote", "عمل عن بعد", "Remote Jobs"],
      ["internships", "تدريب", "Internships"],
      ["seeking-work", "أبحث عن عمل", "Looking for Work"],
    ]],
    ["other", "أخرى", "Other", "package", [
      ["personal-items", "مستلزمات شخصية", "Personal Items"],
      ["tickets", "تذاكر وفعاليات", "Tickets & Events"],
      ["baby-items", "مستلزمات أطفال", "Baby & Kids Items"],
      ["food", "طعام ومشروبات", "Food & Beverages"],
      ["misc", "متفرقات", "Miscellaneous"],
    ]],
  ];

  for (let i = 0; i < cats.length; i++) {
    const [slug, nameAr, nameEn, icon, children] = cats[i];
    await db.category.create({
      data: {
        slug,
        nameAr,
        nameEn,
        icon,
        sortOrder: i,
        children: {
          create: children.map(([cslug, cAr, cEn], j) => ({
            slug: cslug,
            nameAr: cAr,
            nameEn: cEn,
            icon,
            sortOrder: j,
          })),
        },
      },
    });
  }
  const allCats = await db.category.findMany();
  const catId = Object.fromEntries(allCats.map((c) => [c.slug, c.id]));

  // ─── Standard listings ───
  // [catSlug, title, desc, price, cond, city, hood, imgs, featured, views, agoH, seller]
  const listings: [string, string, string, number, string, string, string | null, string[], boolean, number, number, User][] = [
    ["cars-sale", "تويوتا كامري 2022 فل كامل", "كامري GLE فل كامل، ماشية 34,000 كم فقط، صيانات الوكالة، بدون حوادث ولا صبغ. فحص شامل حديث.", 115000, "LIKE_NEW", "الرياض", "حي النرجس", ["car2"], true, 842, 3, fahad],
    ["cars-sale", "هيونداي سوناتا 2020 سمارت", "سوناتا سمارت بحالة ممتازة، ممشى 88 ألف، مكينة وقير على الشرط. البدي نظيف والداخلية نظيفة جداً.", 62000, "USED", "جدة", "حي الصفا", ["car4"], false, 431, 7, ahmed],
    ["cars-sale", "لكزس LX570 2019 بلاك اديشن", "LX570 بلاك اديشن سعودي، ممشى 96 ألف، حادث بسيط مصلح بالوكالة. جميع المواصفات الكاملة مع الشاشات الخلفية.", 310000, "USED", "الرياض", "حي الملقا", ["car1"], true, 1520, 12, khalid],
    ["motorcycles", "دباب هوندا CBR600RR موديل 2021", "دباب رياضي بحالة الوكالة، ممشى 4 آلاف كم فقط، مع طقم الحماية والخوذة. استخدام خفيف جداً.", 28000, "LIKE_NEW", "الدمام", null, ["bike1"], false, 267, 18, majed],
    ["auto-parts", "جنوط لكزس أصلية مقاس 20", "جنوط LX570 أصلية وكالة، بحالة ممتازة بدون خدوش، مع الكفرات نسبة 70%.", 4500, "USED", "الرياض", "حي الشفا", ["tools1"], false, 98, 26, khalid],
    ["apts-sale", "شقة 4 غرف حي الياسمين", "شقة فاخرة 180م في حي الياسمين، دور ثاني مع مصعد، 4 غرف + صالة + مطبخ راكب، عمر البناء 3 سنوات. صك إلكتروني.", 850000, "LIKE_NEW", "الرياض", "حي الياسمين", ["apt1"], true, 1103, 5, noura],
    ["villas", "فيلا دورين وملحق حي المونسية", "فيلا 375م درج داخلي مع شقتين، تشطيب فاخر، مسبح خاص وحوش واسع. قريبة من جميع الخدمات.", 1650000, "NEW", "الرياض", "حي المونسية", ["villa1"], true, 976, 22, sara],
    ["apts-rent", "شقة للإيجار السنوي حي السلامة", "شقة 3 غرف وصالة بمدخل خاص، مجددة بالكامل، قريبة من طريق الأمير سلطان. الإيجار سنوي شامل الصيانة.", 28000, "USED", "جدة", "حي السلامة", ["apt1"], false, 356, 9, fahad],
    ["land", "أرض سكنية شرق الرياض 625م", "أرض سكنية في مخطط معتمد شرق الرياض، شارع 20 شمالي، منطقة نمو وقريبة من الطريق الدائري.", 620000, "NEW", "الرياض", "حي المعالي", ["land1"], false, 289, 30, abdullah],
    ["phones", "آيفون 15 برو ماكس 256GB", "آيفون 15 برو ماكس تيتانيوم طبيعي، حالة البطارية 98%، مع الكرتون وجميع الملحقات الأصلية. ضمان ساري.", 3900, "LIKE_NEW", "الرياض", "حي العليا", ["phone1"], true, 1245, 2, sara],
    ["phones", "سامسونج جالكسي S24 الترا", "S24 الترا 512 قيقا لون أسود، استخدام 3 أشهر فقط، مع فاتورة الشراء والضمان. لا يوجد أي خدش.", 3400, "LIKE_NEW", "الخبر", null, ["phone2"], false, 587, 11, reem],
    ["laptops", "ماك بوك برو M3 شاشة 14", "MacBook Pro M3 Pro، رام 18 قيقا وتخزين 512، استخدام شهرين. مثالي للمصممين والمبرمجين. مع الشاحن الأصلي.", 7500, "LIKE_NEW", "جدة", "حي الروضة", ["laptop1"], true, 903, 6, ahmed],
    ["gaming", "بلايستيشن 5 مع 3 ألعاب", "PS5 نسخة الأقراص، مع يد إضافية و3 ألعاب أصلية (فيفا 24، سبايدرمان 2، جاد أوف وور). بحالة ممتازة.", 1700, "USED", "الرياض", "حي غرناطة", ["console1"], false, 764, 14, sultan],
    ["tvs", "شاشة سوني برافيا 65 بوصة", "شاشة سوني 4K HDR موديل X90L، عمرها سنة واحدة، بدون أي مشاكل. مع الريموت والقاعدة الأصلية.", 2800, "USED", "الدمام", null, ["tv1"], false, 342, 20, khalid],
    ["audio", "سماعة سوني WH-1000XM5", "أفضل سماعة عزل ضجيج، لون أسود، مع العلبة والكرتون. استخدام نظيف جداً.", 900, "LIKE_NEW", "الرياض", null, ["audio1"], false, 218, 16, hind],
    ["living", "طقم كنب 7 مقاعد مودرن", "طقم كنب تركي 7 مقاعد مع طاولة وسط رخام، لون بيج، استخدام سنة. نظيف جداً وقابل للفك والتركيب.", 2500, "USED", "الرياض", "حي قرطبة", ["sofa1"], false, 456, 8, noura],
    ["appliances", "ثلاجة سامسونج 21 قدم", "ثلاجة بابين انفرتر، موفرة للكهرباء، بحالة ممتازة. البيع بسبب السفر.", 1900, "USED", "جدة", "حي النزهة", ["fridge1"], false, 231, 25, fahad],
    ["appliances", "مكيف سبليت جري 24 وحدة", "مكيف جري انفرتر حار/بارد 24000 وحدة، جديد بالكرتون لم يستخدم، مع ضمان الوكيل سنتين.", 1450, "NEW", "مكة المكرمة", null, ["ac1"], false, 187, 28, abdullah],
    ["watches", "ساعة أوميغا سيماستر أصلية", "أوميغا سيماستر أكوا تيرا، خط أزرق، مع العلبة والأوراق الكاملة. شراء 2023 من بوتيك الوكيل.", 18000, "LIKE_NEW", "الرياض", "حي السفارات", ["watch1"], true, 673, 10, majed],
    ["bags", "شنطة لويس فيتون نيفرفل", "شنطة LV نيفرفول MM أصلية 100% مع الفاتورة والداست باق. استخدام خفيف.", 4200, "USED", "جدة", null, ["bag1"], false, 389, 13, reem],
    ["perfumes", "عطر توم فورد عود وود 100مل", "عطر توم فورد أود وود أصلي جديد بالكرتون المغلف، 100 مل. السعر في البوتيك 1450.", 950, "NEW", "الرياض", null, ["perfume1"], false, 276, 4, hind],
    ["cats", "قطة سكوتش فولد شيرازي", "قطة سكوتش فولد عمرها 5 أشهر، مطعمة وبصحة ممتازة، مع دفتر التطعيمات ومستلزماتها كاملة.", 1200, "NEW", "الرياض", null, ["cat1"], false, 512, 6, sara],
    ["horses", "حصان عربي أصيل مسجل واهو", "حصان عربي أصيل مسجل في واهو، عمره 4 سنوات، مدرب على الركوب، هادئ الطباع. للجادين فقط.", 45000, "NEW", "القصيم", null, ["horse1"], true, 834, 34, sultan],
    ["gym", "جهاز مشي كهربائي احترافي", "جهاز مشي LifeFitness تحمل حتى 150 كجم، شاشة رقمية وبرامج متعددة. بحالة الوكالة.", 1100, "USED", "الخبر", null, ["dumbbell1"], false, 143, 19, reem],
    ["bicycles", "دراجة هوائية ترك ماركة أمريكية", "دراجة Trek Marlin 7 مقاس L، جير شيمانو، مع الخوذة وشنطة الصيانة. استخدام بسيط.", 2600, "LIKE_NEW", "الرياض", "حي الروضة", ["bicycle1"], false, 197, 15, ahmed],
    ["camping", "خيمة تخييم عائلية مع ملحقاتها", "خيمة عائلية تتسع 8 أشخاص، عازلة للماء والرياح، مع فرش أرضي وإنارة ليد. استخدام موسم واحد.", 850, "USED", "حائل", null, ["tent1"], false, 122, 21, majed],
    ["books", "مجموعة كتب تطوير الذات 12 كتاب", "12 كتاب بحالة ممتازة: العادات الذرية، فكر تصبح غنياً، قوة العادات وغيرها. البيع بسبب النقل.", 150, "USED", "الرياض", null, ["book1"], false, 87, 17, hind],
  ];

  // demo attributes per subcategory slug (so the spec section shows on cars/realestate/etc.)
  const seedAttrs: Record<string, Record<string, string>> = {
    "cars-sale": { brand: "تويوتا", model: "كامري", year: "2022", mileage: "34000", transmission: "أوتوماتيك", fuel: "بنزين", color: "أبيض" },
    "apts-sale": { purpose: "للبيع", area: "180", rooms: "4", bathrooms: "3", floor: "2", furnished: "غير مفروش" },
    "apts-rent": { purpose: "للإيجار", area: "120", rooms: "3", bathrooms: "2", floor: "1", furnished: "مفروش" },
    villas: { purpose: "للبيع", area: "375", rooms: "6", bathrooms: "5", floor: "2", furnished: "غير مفروش" },
    land: { purpose: "للبيع", area: "625" },
    phones: { brand: "آيفون", storage: "256GB", warranty: "يوجد ضمان" },
    laptops: { brand: "آيفون", storage: "512GB", warranty: "يوجد ضمان" },
  };

  const created: string[] = [];
  for (const [slug, title, desc, price, cond, city, hood, imgs, featured, views, agoH, seller] of listings) {
    const attrs = seedAttrs[slug] ?? {};
    const l = await db.listing.create({
      data: {
        title,
        description: desc,
        price,
        condition: cond,
        city,
        neighborhood: hood,
        images: img(...imgs),
        isFeatured: featured,
        views,
        createdAt: hoursAgo(agoH),
        sellerId: seller.id,
        categoryId: catId[slug],
        whatsapp: seller.phone,
        phone: seller.phone,
        attributes: JSON.stringify(attrs),
        searchText: buildSearchText(title, desc, city, ...Object.values(attrs)),
      },
    });
    created.push(l.id);
  }

  // ─── Live auctions ───
  async function makeAuction(opts: {
    seller: User;
    catSlug: string;
    title: string;
    desc: string;
    city: string;
    imgs: string[];
    start: number;
    inc: number;
    buyNow?: number;
    endsInH: number;
    createdAgoH: number;
    bidders: User[];
    bidCount: number;
    top: number;
    featured?: boolean;
    views?: number;
    terms?: string;
  }) {
    const listing = await db.listing.create({
      data: {
        type: "AUCTION",
        title: opts.title,
        description: opts.desc,
        condition: "USED",
        city: opts.city,
        images: img(...opts.imgs),
        isFeatured: opts.featured ?? false,
        views: opts.views ?? 300,
        createdAt: hoursAgo(opts.createdAgoH),
        sellerId: opts.seller.id,
        categoryId: catId[opts.catSlug],
        searchText: buildSearchText(opts.title, opts.desc, opts.city),
      },
    });
    const auction = await db.auction.create({
      data: {
        listingId: listing.id,
        startPrice: opts.start,
        minIncrement: opts.inc,
        buyNowPrice: opts.buyNow,
        endsAt: inHours(opts.endsInH),
        terms: opts.terms ?? "المعاينة قبل الاستلام. البيع نهائي بعد إغلاق المزاد.",
      },
    });
    // ascending bid ladder ending at `top`
    let amount = opts.start;
    const span = opts.top - opts.start;
    for (let i = 0; i < opts.bidCount; i++) {
      const bidder = opts.bidders[i % opts.bidders.length];
      amount =
        i === opts.bidCount - 1
          ? opts.top
          : Math.min(
              opts.top - opts.inc,
              Math.max(
                amount + opts.inc,
                opts.start + Math.round((span * i) / opts.bidCount / opts.inc) * opts.inc
              )
            );
      await db.bid.create({
        data: {
          auctionId: auction.id,
          bidderId: bidder.id,
          amount,
          maskedName: maskedBidderName(bidder.id, auction.id),
          createdAt: hoursAgo(opts.createdAgoH * (1 - (i + 1) / (opts.bidCount + 1))),
        },
      });
    }
    return { listing, auction };
  }

  await makeAuction({
    seller: khalid, catSlug: "cars-sale",
    title: "تويوتا لاندكروزر GXR 2021 فل كامل",
    desc: "لاندكروزر GXR-3 تورنق سعودي، ممشى 61 ألف، بدون حوادث نهائياً، صيانات منتظمة بالوكالة. فحص كامل ومستعد للمعاينة بالرياض.",
    city: "الرياض", imgs: ["car1"], start: 180000, inc: 1000,
    endsInH: 2.2, createdAgoH: 70, bidders: [demo, fahad, ahmed, sultan, reem],
    bidCount: 9, top: 214000, featured: true, views: 2431,
  });
  await makeAuction({
    seller: sara, catSlug: "phones",
    title: "آيفون 15 برو ماكس 256GB تيتانيوم",
    desc: "آيفون 15 برو ماكس بحالة ممتازة، بطارية 96%، مع الكرتون والملحقات. البيع لأعلى سعر بعد انتهاء المزاد مباشرة.",
    city: "الرياض", imgs: ["phone1"], start: 2500, inc: 50,
    endsInH: 0.75, createdAgoH: 46, bidders: [ahmed, khalid, reem, majed],
    bidCount: 12, top: 3350, featured: true, views: 1876,
  });
  await makeAuction({
    seller: majed, catSlug: "plates",
    title: "لوحة مميزة — ب ن د 8",
    desc: "لوحة سيارة مميزة رباعية (ب ن د 8)، نقل ملكية رسمي عبر أبشر. المزايدة للجادين.",
    city: "حائل", imgs: ["plate1"], start: 15000, inc: 500,
    endsInH: 5, createdAgoH: 90, bidders: [khalid, sultan, fahad, abdullah],
    bidCount: 9, top: 22000, views: 1204,
  });
  await makeAuction({
    seller: sultan, catSlug: "falcons",
    title: "صقر شاهين فرخ مدرب",
    desc: "شاهين فرخ هذا الموسم، مدرب على المخلاة واللقمة، وزنه 920 جرام. صحته ممتازة وريشه كامل.",
    city: "بريدة", imgs: ["falcon1"], start: 8000, inc: 250,
    endsInH: 26, createdAgoH: 40, bidders: [majed, abdullah, khalid],
    bidCount: 7, top: 12500, featured: true, views: 1567,
  });
  await makeAuction({
    seller: fahad, catSlug: "watches",
    title: "رولكس ديتجست 41 أصلية",
    desc: "رولكس Datejust 41 ميناء أزرق، موديل 2022، مع العلبة والأوراق الكاملة وفاتورة الوكيل. حالة ممتازة جداً.",
    city: "جدة", imgs: ["watch1"], start: 25000, inc: 500, buyNow: 38000,
    endsInH: 68, createdAgoH: 30, bidders: [demo, reem, sara, noura],
    bidCount: 5, top: 28500, views: 987,
  });
  await makeAuction({
    seller: reem, catSlug: "gaming",
    title: "بلايستيشن 5 + يدين و5 ألعاب",
    desc: "PS5 نسخة الأقراص مع يدين أصليتين و5 ألعاب. الجهاز نظيف جداً ويشمل جميع الأسلاك والكرتون.",
    city: "الخبر", imgs: ["console2"], start: 1200, inc: 50,
    endsInH: 0.55, createdAgoH: 50, bidders: [sultan, ahmed, hind, khalid],
    bidCount: 10, top: 1750, views: 1345,
  });
  await makeAuction({
    seller: abdullah, catSlug: "cars-sale",
    title: "مرسيدس S500 موديل 2019",
    desc: "مرسيدس S500 خليجي، ممشى 78 ألف، بحالة الوكالة. جميع الصيانات موثقة لدى الجفالي. الشراء الفوري متاح.",
    city: "مكة المكرمة", imgs: ["car3"], start: 220000, inc: 2000, buyNow: 320000,
    endsInH: 44, createdAgoH: 28, bidders: [khalid, fahad, demo],
    bidCount: 6, top: 244000, featured: true, views: 1789,
  });
  await makeAuction({
    seller: sultan, catSlug: "camels",
    title: "ناقة مجاهيم منتجة",
    desc: "ناقة مجاهيم عمرها 6 سنوات، منتجة وحليبها غزير، بصحة ممتازة. المعاينة في بريدة.",
    city: "بريدة", imgs: ["camel1"], start: 30000, inc: 500,
    endsInH: 8, createdAgoH: 24, bidders: [majed, abdullah, fahad],
    bidCount: 4, top: 33500, views: 654,
  });

  // ─── Ended auction → demo WON (pending mutual confirmation) ───
  const camListing = await db.listing.create({
    data: {
      type: "AUCTION",
      title: "كاميرا سوني A7 III مع عدسة 28-70",
      description: "كاميرا سوني A7 III فل فريم مع العدسة الأساسية، شتر 12 ألف فقط، مع 3 بطاريات وشاحن وحقيبة.",
      condition: "USED", city: "الرياض", images: img("camera1"),
      status: "SOLD", views: 1420, createdAt: hoursAgo(120),
      sellerId: noura.id, categoryId: catId["cameras"],
    },
  });
  const camAuction = await db.auction.create({
    data: {
      listingId: camListing.id, startPrice: 3500, minIncrement: 100,
      endsAt: hoursAgo(8), status: "ENDED", winnerId: demo.id, winningBid: 5200,
    },
  });
  for (const [bidder, amount, agoH] of [[ahmed, 3500, 60], [khalid, 4100, 40], [ahmed, 4600, 20], [demo, 5200, 9]] as const) {
    await db.bid.create({
      data: {
        auctionId: camAuction.id, bidderId: bidder.id, amount,
        maskedName: maskedBidderName(bidder.id, camAuction.id),
        createdAt: hoursAgo(agoH),
      },
    });
  }
  await db.transaction.create({
    data: {
      listingId: camListing.id, sellerId: noura.id, buyerId: demo.id,
      amount: 5200, source: "AUCTION", deadline: inHours(40), createdAt: hoursAgo(8),
    },
  });

  // ─── Ended auction → demo SOLD (pending confirmation as seller) ───
  const rogListing = await db.listing.create({
    data: {
      type: "AUCTION",
      title: "لابتوب ASUS ROG Strix للقيمنق",
      description: "لابتوب قيمنق ROG Strix G16، معالج i9 وكرت RTX 4070، رام 32 قيقا. استخدام 6 أشهر بحالة ممتازة.",
      condition: "USED", city: "الرياض", images: img("laptop1"),
      status: "SOLD", views: 980, createdAt: hoursAgo(140),
      sellerId: demo.id, categoryId: catId["laptops"],
    },
  });
  const rogAuction = await db.auction.create({
    data: {
      listingId: rogListing.id, startPrice: 3000, minIncrement: 100,
      endsAt: hoursAgo(4), status: "ENDED", winnerId: khalid.id, winningBid: 4300,
    },
  });
  for (const [bidder, amount, agoH] of [[sultan, 3000, 30], [khalid, 3600, 18], [sultan, 3900, 10], [khalid, 4300, 5]] as const) {
    await db.bid.create({
      data: {
        auctionId: rogAuction.id, bidderId: bidder.id, amount,
        maskedName: maskedBidderName(bidder.id, rogAuction.id),
        createdAt: hoursAgo(agoH),
      },
    });
  }
  await db.transaction.create({
    data: {
      listingId: rogListing.id, sellerId: demo.id, buyerId: khalid.id,
      amount: 4300, source: "AUCTION", deadline: inHours(44), createdAt: hoursAgo(4),
    },
  });

  // ─── Disputed transaction (visible in admin panel) ───
  const watchListing = await db.listing.create({
    data: {
      type: "AUCTION",
      title: "ساعة أبل الترا 2",
      description: "أبل واتش الترا 2 مع سيرين أصلي وحزامين، بحالة ممتازة مع الكرتون.",
      condition: "USED", city: "الرياض", images: img("watch1"),
      status: "SOLD", views: 540, createdAt: hoursAgo(200),
      sellerId: hind.id, categoryId: catId["watches"],
    },
  });
  const watchAuction = await db.auction.create({
    data: {
      listingId: watchListing.id, startPrice: 1500, minIncrement: 50,
      endsAt: hoursAgo(72), status: "ENDED", winnerId: ahmed.id, winningBid: 2100,
    },
  });
  await db.bid.create({
    data: {
      auctionId: watchAuction.id, bidderId: ahmed.id, amount: 2100,
      maskedName: maskedBidderName(ahmed.id, watchAuction.id), createdAt: hoursAgo(73),
    },
  });
  const disputedTx = await db.transaction.create({
    data: {
      listingId: watchListing.id, sellerId: hind.id, buyerId: ahmed.id,
      amount: 2100, source: "AUCTION", sellerAnswer: "YES", buyerAnswer: "NO",
      status: "DISPUTED", deadline: hoursAgo(24), createdAt: hoursAgo(72),
    },
  });
  const dispute = await db.dispute.create({
    data: { transactionId: disputedTx.id, createdAt: hoursAgo(30) },
  });
  await db.evidence.createMany({
    data: [
      { disputeId: dispute.id, userId: hind.id, note: "سلمت الساعة للمشتري يوم الثلاثاء في موقف الحديقة، وهذه لقطة من محادثتنا نتفق فيها على الموعد." },
      { disputeId: dispute.id, userId: ahmed.id, note: "حضرت للموعد ولم يحضر البائع، وحاولت الاتصال ثلاث مرات دون رد. لم أستلم أي شيء." },
    ],
  });

  // ─── Plans (admin-editable packages) ───
  await db.plan.createMany({
    data: [
      {
        key: "FREE", name: "الحساب المجاني", price: 0, period: "",
        features: JSON.stringify(["10 إعلانات نشطة", "3 مزادات نشطة", "متجر واحد", "5 نقاط يومية مجانية", "ظهور عادي في البحث"]),
        maxListings: 10, maxAuctions: 3, maxStores: 1, dailyPoints: 5, sortOrder: 0,
      },
      {
        key: "PRO_MONTHLY", name: "برو شهري", price: 99, period: "شهرياً",
        features: JSON.stringify(["إعلانات غير محدودة", "10 مزادات نشطة", "حتى 5 متاجر", "25 نقطة يومية مجانية", "أولوية في نتائج البحث", "شارة PRO على ملفك", "قناة دعم مخصصة"]),
        maxListings: 100000, maxAuctions: 10, maxStores: 5, dailyPoints: 25, highlight: true, sortOrder: 1,
      },
      {
        key: "PRO_YEARLY", name: "برو سنوي", price: 899, period: "سنوياً — وفّر 25%",
        features: JSON.stringify(["كل مزايا برو الشهري", "حتى 10 متاجر", "40 نقطة يومية مجانية", "أولوية قصوى في الظهور"]),
        maxListings: 100000, maxAuctions: 10, maxStores: 10, dailyPoints: 40, sortOrder: 2,
      },
    ],
  });

  // ─── Point recharge packages (admin-editable) ───
  await db.pointPackage.createMany({
    data: [
      { points: 100, bonus: 0, price: 10, sortOrder: 0 },
      { points: 500, bonus: 50, price: 45, sortOrder: 1 },
      { points: 1000, bonus: 150, price: 85, sortOrder: 2 },
      { points: 5000, bonus: 1000, price: 400, sortOrder: 3 },
    ],
  });

  // ─── Global settings (admin-tunable) ───
  await db.setting.createMany({
    data: [
      { key: "POINTS_PER_VISITOR", value: "3" }, // campaign cost per targeted visitor
      { key: "FEATURE_POINT_COST", value: "100" }, // points to feature a listing 7 days
    ],
  });

  // ─── Banned words (normalized) ───
  await db.bannedWord.createMany({
    data: ["سلاح", "مخدرات", "قمار", "تزوير", "مسروق"].map((w) => ({
      word: normalizeArabic(w),
    })),
  });

  // ─── Demo store ───
  await db.store.create({
    data: {
      userId: demo.id,
      slug: "alamri-tech",
      name: "متجر العمري للتقنية",
      description: "أجهزة إلكترونية مستعملة بحالة ممتازة — فحص ومعاينة قبل الاستلام.",
      bannerUrl: "/images/showcase/pro.svg",
    },
  });

  // ─── Comments on the iPhone listing ───
  await db.comment.createMany({
    data: [
      { listingId: created[9], userId: khalid.id, body: "هل البطارية أصلية أم مغيرة؟", createdAt: hoursAgo(1.5) },
      { listingId: created[9], userId: sara.id, body: "البطارية أصلية 98% ولم تفتح الشاشة نهائياً.", createdAt: hoursAgo(1.2) },
      { listingId: created[9], userId: fahad.id, body: "آخر سعر كم؟ أنا جاد", createdAt: hoursAgo(0.5) },
    ],
  });

  // ─── Sample report (visible in admin) ───
  await db.report.create({
    data: {
      reporterId: reem.id,
      targetType: "LISTING",
      targetId: created[19],
      reason: "أشك أن الشنطة تقليد وليست أصلية كما هو مذكور في الإعلان.",
      createdAt: hoursAgo(6),
    },
  });

  // ─── Banners ───
  await db.banner.createMany({
    data: [
      { title: "مزادات حراج ستيشن المباشرة", imageUrl: "/images/showcase/auctions.svg", linkUrl: "/auctions", position: "HOME_TOP", status: "ACTIVE" },
      { title: "موسم السيارات في حراج ستيشن", imageUrl: "/images/showcase/cars.svg", linkUrl: "/category/cars", position: "HOME_TOP", status: "ACTIVE" },
      { title: "حساب برو للتجار", imageUrl: "/images/showcase/pro.svg", linkUrl: "/pro", position: "HOME_MIDDLE", status: "ACTIVE" },
    ],
  });

  // ─── Demo user extras ───
  await db.favorite.createMany({
    data: [created[0], created[9], created[18]].map((listingId) => ({
      userId: demo.id,
      listingId,
    })),
  });
  await db.notification.createMany({
    data: [
      { userId: demo.id, type: "WON", title: "مبروك! فزت بالمزاد", body: "فزت بمزاد \"كاميرا سوني A7 III\" بمبلغ 5,200 ر.س. تواصل مع البائع لترتيب الاستلام.", link: "/dashboard/verifications", createdAt: hoursAgo(8) },
      { userId: demo.id, type: "SOLD", title: "تهانينا! تم بيع مزادك", body: "تم بيع \"لابتوب ASUS ROG Strix\" بمبلغ 4,300 ر.س. أكد التسليم خلال 48 ساعة.", link: "/dashboard/verifications", createdAt: hoursAgo(4) },
      { userId: demo.id, type: "OUTBID", title: "تم تجاوز مزايدتك", body: "زايد شخص آخر على \"تويوتا لاندكروزر GXR 2021\". المزايدة الحالية 214,000 ر.س.", link: "/auctions", createdAt: hoursAgo(1), readAt: null },
      { userId: demo.id, type: "SYSTEM", title: "أهلاً بك في حراج ستيشن", body: "اكتمل تفعيل حسابك. ابدأ بتصفح المزادات الحية أو أضف إعلانك الأول.", createdAt: hoursAgo(24 * 300), readAt: hoursAgo(24 * 299) },
    ],
  });
  await db.credibilityLog.createMany({
    data: [
      { userId: demo.id, delta: 5, reason: "معاملة ناجحة (تأكيد متبادل)", createdAt: hoursAgo(24 * 6) },
      { userId: demo.id, delta: 5, reason: "معاملة ناجحة (تأكيد متبادل)", createdAt: hoursAgo(24 * 19) },
      { userId: demo.id, delta: -3, reason: "عدم الرد على تأكيد المعاملة خلال المهلة", createdAt: hoursAgo(24 * 60) },
    ],
  });

  // ─── Assign sequential reference numbers (SM-100001…) to all listings ───
  const allListings = await db.listing.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  let seq = 100000;
  for (const l of allListings) {
    seq += 1;
    await db.listing.update({ where: { id: l.id }, data: { ref: `SM-${seq}` } });
  }
  await db.setting.upsert({
    where: { key: "LISTING_SEQ" },
    create: { key: "LISTING_SEQ", value: String(seq) },
    update: { value: String(seq) },
  });

  const counts = {
    users: await db.user.count(),
    categories: await db.category.count(),
    listings: await db.listing.count(),
    auctions: await db.auction.count(),
    bids: await db.bid.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
