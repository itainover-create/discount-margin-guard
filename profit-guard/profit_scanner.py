import requests
import time

class ProfitGuardScanner:
    def __init__(self, domains):
        self.domains = domains
        self.coupons = ['WELCOME10', 'SAVE10', 'SAVE15', 'JOIN10', 'FIRST10']
        self.headers = {'User-Agent': 'Mozilla/5.0 ProfitGuard-Audit/2.0'}

    def check_site(self, domain):
        base_url = f"https://{domain}" if not domain.startswith('http') else domain
        print(f"\n[*] Auditing: {domain}")
        
        try:
            # שיפור: הגדלת ה-Limit ל-250 מוצרים כדי לא לפספס פריטים כמו ב-Wisetek
            r = requests.get(f"{base_url}/products.json?limit=250", headers=self.headers, timeout=15)
            products = r.json().get('products', [])
            
            sale_items = []
            for p in products:
                for v in p['variants']:
                    if v['compare_at_price'] and v['price'] and float(v['compare_at_price']) > float(v['price']):
                        sale_items.append({'id': v['id'], 'name': p['title'], 'price': v['price']})
                        break # מצאנו וריאנט אחד ב-Sale, מספיק לבדיקה

            if not sale_items:
                print(f"[-] No items in 'Sale' found among {len(products)} products.")
                return

            print(f"[+] Found {len(sale_items)} items in Sale. Testing stacking logic...")

            # בדיקת הזרקת קופון על הלווייתן הראשון שנמצא
            target_item = sale_items[0]
            for code in self.coupons:
                audit_url = f"{base_url}/discount/{code}?redirect=/cart/add?id={target_item['id']}"
                resp = requests.get(audit_url, headers=self.headers, timeout=10)
                
                # בדיקה אם הקופון נשמר ב-Cookies (אינדיקציה חזקה להצלחה בשופיפיי)
                if any(code.lower() in str(c).lower() for c in resp.cookies):
                    print(f" [!!!] ALERT: Stacking detected on '{target_item['name']}' with code: {code}")
                    print(f" [!] Evidence: {audit_url}")
                    return True
            
            print("[-] No stacking detected with common codes.")

        except Exception as e:
            print(f"[!] Error: {str(e)}")
        return False

# רשימת הלווייתנים לסריקה
targets = ["wisetekmarket.com", "jackery.com", "bluettipower.com", "ecoflow.com", "anker.com"]

scanner = ProfitGuardScanner(targets)
for site in targets:
    scanner.check_site(site)
    time.sleep(2)