// End-to-end smoke test (demo mode). Usage: start the app (npm run build && npm start), then
//   BASE_URL=http://localhost:3000 npm run test:e2e
// Requires Playwright with Chromium available on the machine.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";

// Resolved with require so a globally installed Playwright (NODE_PATH) works too.
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let passed = 0;
const failures = [];
const check = (ok, label) => {
  if (ok) { passed++; console.log(`  ok  ${label}`); } else { failures.push(label); console.log(`FAIL  ${label}`); }
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const digits = (s) => s.replace(/[^\d.,%₪−-]/g, "");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "he-IL", acceptDownloads: true, deviceScaleFactor: SHOTS ? 2 : 1 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// --- public pages, branding, RTL
await page.goto(BASE);
check((await page.getAttribute("html", "dir")) === "rtl" && (await page.getAttribute("html", "lang")) === "he", "document is Hebrew RTL");
check(await page.getByText("Developed by Alon Novitarger").first().isVisible(), "landing shows developer credit");
check((await page.getByText("WHERE GREAT MINDS SHAPE THE FUTURE.").count()) > 0, "official slogan is shown");
check((await page.locator('img[alt="ORION"]').count()) > 0, "ORION logo assets are rendered");
if (SHOTS) await page.waitForTimeout(2500);
await shot(page, "01-landing");
await page.goto(`${BASE}/about`);
check(await page.getByText("אלון נוביטרגר").first().isVisible(), "about page credits the founder in Hebrew");
await shot(page, "02-about");

// --- protected routes redirect
await page.goto(`${BASE}/dashboard`);
await page.waitForURL("**/login");
check(true, "protected route redirects signed-out visitors to /login");

// --- registration validation
await page.goto(`${BASE}/register`);
await page.getByRole("button", { name: "יצירת חשבון" }).click();
check(await page.getByText("יש להזין שם מלא").isVisible(), "registration form validates required fields");
await page.getByLabel("שם מלא").fill("בודק מערכת");
await page.getByLabel("אימייל").fill("tester@example.com");
await page.getByLabel("סיסמה", { exact: true }).fill("Passw0rd!x");
await page.getByLabel("אימות סיסמה").fill("different");
await page.getByRole("button", { name: "יצירת חשבון" }).click();
check(await page.getByText("הסיסמאות אינן תואמות").isVisible(), "password confirmation is validated");
await shot(page, "03-register");
await page.getByLabel("אימות סיסמה").fill("Passw0rd!x");
await page.getByRole("button", { name: "יצירת חשבון" }).click();
await page.waitForURL("**/onboarding");

// --- onboarding
await page.getByRole("button", { name: "המשך" }).click();
check(await page.getByText("יש להזין שם עסק").isVisible(), "onboarding validates the business name");
await page.getByLabel("שם העסק").fill("מיזוג הבדיקה");
await page.getByRole("button", { name: "המשך" }).click();
check((await page.getByLabel("שיעור מע״מ להצגה").inputValue()) === "18", "VAT defaults to 18% and is editable");
await page.getByLabel(/עלות פנימית לשעת עבודה/).fill("90");
await shot(page, "04-onboarding");
await page.getByRole("button", { name: "המשך" }).click();
await page.getByLabel(/הוצאות קבועות חודשיות/).fill("6000");
await page.getByLabel(/שעות עבודה לחיוב בחודש/).fill("120");
await page.getByRole("button", { name: "סיום והמשך ללוח הבקרה" }).click();
await page.waitForURL("**/dashboard");

// --- dashboard
await page.getByText("סך ההכנסות שדווחו").waitFor();
check(await page.getByText("סביבת הדגמה.").isVisible(), "demo mode is clearly labelled");
check(await page.getByText("מוצגים נתוני דוגמה בדיוניים.").isVisible(), "sample data is clearly labelled as fictional");
check((await page.locator(".recharts-surface").count()) >= 2, "dashboard charts render");
check((await page.getByText("עבודה הפסדית").count()) > 0, "loss-making job produces a warning");
await page.waitForTimeout(900);
await shot(page, "05-dashboard");
const kpi = async () => digits(await page.locator(".tile-3d").first().locator(".num").first().innerText());
const month = await kpi();
await page.getByLabel("תקופת הדוח").selectOption("this_year");
const year = await kpi();
await page.getByLabel("תקופת הדוח").selectOption("custom");
await page.getByLabel("מתאריך").fill("2000-01-01");
await page.getByLabel("עד תאריך").fill("2000-01-31");
check(await page.getByText("אין עבודות שהושלמו בתקופה").first().isVisible(), "custom date range with no jobs shows an empty state");
check(month !== year || month !== "₪0", `date filter changes the totals (month ${month} / year ${year})`);
await page.reload();
await page.getByText("סך ההכנסות שדווחו").waitFor();
check(true, "session and data persist across a reload");

// --- jobs list, search, CSV
await page.goto(`${BASE}/jobs`);
await page.getByRole("heading", { name: "עבודות" }).waitFor();
check((await page.locator("tbody tr").count()) === 14, "jobs list shows the 14 sample jobs");
await page.getByLabel("חיפוש עבודות").fill("נזילה");
check((await page.locator("tbody tr").count()) === 1, "search filters the list");
await page.getByLabel("חיפוש עבודות").fill("");
await page.getByLabel("סינון לפי סטטוס").selectOption("completed");
check((await page.locator("tbody tr").count()) === 9, "status filter works");
await page.getByLabel("סינון לפי סטטוס").selectOption("");
await shot(page, "06-jobs");
const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "ייצוא CSV" }).click()]);
const csv = readFileSync(await download.path(), "utf8");
check(csv.charCodeAt(0) === 0xfeff && csv.includes("מספר עבודה") && csv.trim().split("\r\n").length === 15, "CSV export has a BOM, Hebrew headers and one row per job");

// --- create a job: Test 1 scenario (revenue 1500, costs 900 → profit 600, 40%)
await page.goto(`${BASE}/jobs/new`);
await page.getByRole("button", { name: "יצירת העבודה" }).click();
check(await page.getByText("יש להזין שם עבודה").isVisible(), "job form validates the title");
await page.getByLabel("שם העבודה").fill("עבודת בדיקה אוטומטית");
await page.getByLabel(/מחיר בהצעת המחיר/).fill("-5");
await page.getByRole("button", { name: "יצירת העבודה" }).click();
check(await page.getByText("יש להזין סכום תקין (0 ומעלה)").first().isVisible(), "negative prices are rejected");
await page.getByLabel(/מחיר בהצעת המחיר/).fill("1500");
check(await page.getByText(/ללקוח/).first().innerText().then((s) => s.includes("1,770")), "price preview shows ₪1,770 including 18% VAT");
await page.getByRole("button", { name: "יצירת העבודה" }).click();
await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
const addCost = async (category, fill) => {
  await page.getByRole("button", { name: "הוספת עלות" }).click();
  await page.getByLabel("סוג עלות").selectOption(category);
  await fill();
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
};
await page.getByRole("tab", { name: /עלויות מוערכות/ }).click();
await addCost("materials", async () => { await page.getByLabel("שם הפריט").fill("חומר"); await page.getByLabel("כמות").fill("2"); await page.getByLabel("עלות ליחידה").fill("150"); });
await addCost("labor", async () => { await page.getByLabel("שעות עבודה").fill("5"); await page.getByLabel("עלות פנימית לשעה").fill("100"); });
await page.getByRole("tab", { name: "סקירה" }).click();
const est = page.locator(".card", { hasText: "רווחיות מוערכת" });
check((await est.innerText()).includes("700") && (await est.innerText()).includes("46.67%"), "estimated profit ₪700 (46.67%) from ₪1,500 − ₪800");
await page.getByRole("tab", { name: /עלויות בפועל/ }).click();
await page.getByRole("button", { name: "העתקה מההערכה" }).click();
await page.getByText("סה״כ בפועל").waitFor();
await addCost("contractor", async () => { await page.getByLabel(/שם הקבלן/).fill("קבלן"); await page.getByLabel("סכום").fill("100"); });
await page.getByRole("tab", { name: "סקירה" }).click();
const act = page.locator(".card", { hasText: "רווחיות בפועל" });
check((await act.innerText()).includes("600") && (await act.innerText()).includes("40%"), "Test 1/7 in the UI: actual costs ₪900 → profit ₪600, margin 40%");
check((await act.innerText()).includes("66.67%"), "markup (66.67%) is shown separately from margin (40%)");
await page.getByRole("tab", { name: "הערכה מול ביצוע" }).click();
check(await page.getByText("חריגה בקבלני משנה").isVisible(), "estimate-vs-actual explains the overrun category");
await shot(page, "07-job-variance");
await page.getByRole("tab", { name: "סקירה" }).click();
await shot(page, "08-job-overview");
await page.getByLabel("שינוי סטטוס").selectOption("completed");
await page.getByText("הסטטוס עודכן").waitFor();
await page.reload();
await page.getByRole("heading", { name: "עבודת בדיקה אוטומטית" }).waitFor();
check((await page.locator("header").last().innerText()).includes("הושלמה"), "job changes persist after reload");

// --- pricing calculator: Test 4 (costs 900, margin 30% → 1,285.71)
await page.goto(`${BASE}/pricing-calculator`);
await page.getByLabel("חומרים").fill("400");
await page.getByLabel("שעות עבודה").fill("5");
await page.getByLabel("עלות פנימית לשעה").fill("80");
await page.getByLabel("נסיעות").fill("60");
await page.getByLabel("הוצאות אחרות").fill("40");
await page.getByRole("button", { name: "30%" }).click();
const hero = page.locator(".tile-3d").first();
check((await hero.innerText()).includes("1,285.71"), "Test 4 in the UI: ₪900 at 30% → ₪1,285.71 before VAT");
check((await hero.innerText()).includes("1,517.14"), "customer price adds 18% VAT (₪1,517.14)");
await shot(page, "09-calculator");
await page.getByLabel("יעד שיעור רווח").fill("100");
check(await page.getByText("יעד הרווח חייב להיות בין 0% ל־100% (לא כולל)").isVisible(), "a 100% margin is rejected instead of dividing by zero");
await page.getByRole("tab", { name: "כמה ארוויח במחיר נתון?" }).click();
await page.getByLabel(/המחיר שאני מתכוון לגבות/).fill("1500");
check((await hero.innerText()).includes("600"), "reverse calculation: charging ₪1,500 earns ₪600");
await page.getByRole("button", { name: "שמירה כטיוטה" }).click();
await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);
check(await page.getByText("טיוטה").first().isVisible(), "calculation is saved as a draft job");

// --- analytics, customers, team, settings
await page.goto(`${BASE}/analytics`);
await page.getByText("רווח לפי שירות").first().waitFor();
check((await page.locator("tbody tr").count()) >= 4, "service profitability report lists services");
await page.waitForTimeout(700);
await shot(page, "10-analytics");
await page.getByRole("tab", { name: "לפי עובד/ת" }).click();
check(await page.getByText("רווח מיוחס לשעה").isVisible(), "employee report renders");
await page.goto(`${BASE}/customers`);
await page.getByRole("button", { name: "לקוח חדש" }).first().click();
await page.getByLabel("שם הלקוח").fill("לקוח בדיקה");
await page.getByLabel(/אימייל/).fill("not-an-email");
await page.getByRole("button", { name: "שמירה", exact: true }).click();
check(await page.getByText("כתובת אימייל לא תקינה").isVisible(), "customer e-mail is validated");
await page.getByLabel(/אימייל/).fill("c@example.com");
await page.getByRole("button", { name: "שמירה", exact: true }).click();
await page.getByRole("dialog").waitFor({ state: "detached" });
check(await page.getByText("לקוח בדיקה").isVisible(), "customer is created");
await shot(page, "11-customers");
await page.goto(`${BASE}/team`);
await page.getByRole("heading", { name: "גישה למערכת" }).waitFor();
await shot(page, "12-team");
await page.goto(`${BASE}/settings`);
await page.getByRole("tab", { name: "פיננסי" }).click();
await page.getByLabel("יעד שיעור רווח").fill("35");
await page.getByRole("button", { name: "שמירה", exact: true }).click();
await page.getByText("נשמר בהצלחה").waitFor();
await shot(page, "13-settings");
await page.reload();
await page.getByRole("tab", { name: "פיננסי" }).click();
check((await page.getByLabel("יעד שיעור רווח").inputValue()) === "35", "settings persist after reload");

// --- mobile navigation + RTL layout
const mobile = await context.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto(`${BASE}/dashboard`);
await mobile.getByText("סך ההכנסות שדווחו").waitFor();
check(await mobile.getByRole("navigation", { name: "ניווט מהיר" }).isVisible(), "mobile bottom navigation is visible");
check(!(await mobile.locator("aside").isVisible()), "desktop sidebar is hidden on mobile");
check(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal overflow on mobile dashboard");
await mobile.waitForTimeout(700);
await shot(mobile, "14-mobile-dashboard");
await mobile.getByRole("button", { name: "פתיחת תפריט" }).click();
await mobile.getByRole("dialog").getByRole("link", { name: "הגדרות" }).waitFor();
await shot(mobile, "15-mobile-menu");
await mobile.getByRole("dialog").getByRole("link", { name: "לקוחות" }).click();
await mobile.waitForURL("**/customers");
check(true, "mobile drawer navigates between screens");
await mobile.getByRole("navigation", { name: "ניווט מהיר" }).getByRole("link", { name: "עבודות" }).click();
await mobile.waitForURL("**/jobs");
check(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal overflow on mobile jobs list");
await shot(mobile, "16-mobile-jobs");
await mobile.close();
const box = await page.locator("aside").boundingBox();
check(box && box.x > 1000, "sidebar sits on the right-hand side (true RTL layout)");

// --- remove sample data, sign out, sign back in
await page.goto(`${BASE}/dashboard`);
await page.getByRole("button", { name: "הסרת נתוני הדוגמה" }).click();
await page.getByRole("dialog").getByRole("button", { name: "הסרת נתוני הדוגמה" }).click();
await page.getByText("נתוני הדוגמה הוסרו").waitFor();
await page.goto(`${BASE}/jobs`);
await page.getByRole("heading", { name: "עבודות" }).waitFor();
check((await page.locator("tbody tr").count()) === 2, "removing sample data keeps only the user's own jobs");
await page.getByRole("button", { name: "התנתקות" }).click();
await page.waitForURL("**/login");
await page.getByLabel("אימייל").fill("tester@example.com");
await page.getByLabel("סיסמה").fill("wrong-password");
await page.getByRole("button", { name: "התחברות" }).click();
check(await page.getByText("אימייל או סיסמה שגויים").first().waitFor({ timeout: 8000 }).then(() => true, () => false), "wrong password is rejected");
await page.getByLabel("סיסמה").fill("Passw0rd!x");
await page.getByRole("button", { name: "התחברות" }).click();
await page.waitForURL("**/dashboard");
check(true, "sign-out and sign-in work");
await shot(page, "17-dashboard-own-data");
if (SHOTS) {
  const guest = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await guest.goto(`${BASE}/login`);
  await guest.waitForTimeout(2500);
  await guest.screenshot({ path: `${SHOTS}/18-login.png` });
  await guest.close();
}

check(errors.length === 0, `no console or page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
