import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/final-qa')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800})
  page=await context.new_page(); errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080',wait_until='networkidle')
  with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: minted=json.load(f)
  await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
  writes=[]
  async def guard(route):
   req=route.request
   if '/rest/v1/' in req.url and req.method not in ['GET','HEAD','OPTIONS']:
    writes.append(req.method); await route.fulfill(status=409,json={'message':'QA blocks shared writes'})
   else: await route.continue_()
  await context.route('**/*',guard)
  for path in ['/orders','/services/food','/services/food/cart','/services/padala','/services/pabili','/services/food/manual','/services/ride','/admin','/admin/wallet','/admin/rider-finance','/admin/finance','/driver','/driver/wallet','/checkout/00000000-0000-0000-0000-000000000000']:
   await page.goto('http://localhost:8080'+path,wait_until='networkidle'); await page.wait_for_timeout(1200)
   print(path,'title:',await page.title(),'headings:',await page.locator('h1').all_text_contents(),'overflow:',await page.evaluate('document.documentElement.scrollWidth>innerWidth'))
   if path in ['/orders','/services/ride','/admin/rider-finance']: await page.screenshot(path=str(OUT/(path.strip('/').replace('/','_')+'.png')))
  await page.set_viewport_size({'width':390,'height':844})
  for path in ['/services/ride','/services/padala','/orders','/admin/rider-finance']:
   await page.goto('http://localhost:8080'+path,wait_until='networkidle'); await page.wait_for_timeout(500)
   print('mobile',path,'overflow:',await page.evaluate('document.documentElement.scrollWidth>innerWidth'))
   await page.screenshot(path=str(OUT/('mobile_'+path.strip('/').replace('/','_')+'.png')))
  print('page_errors',errors,'blocked_write_attempts',len(writes))
  await browser.close()
asyncio.run(main())
