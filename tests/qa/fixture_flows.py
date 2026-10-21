import asyncio,json,os
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/final-qa')
OID='00000000-0000-0000-0000-00000000aa01'; UID='00000000-0000-0000-0000-00000000cc01'; RID='00000000-0000-0000-0000-00000000bb01'
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':1800})
  page=await context.new_page(); errors=[]; calls=[]; rows=[]; settlements=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: minted=json.load(f)
  # Use existing account identity, but all app data below is isolated mocked traffic.
  UID=minted['session']['user']['id']; RID=UID
  def order(service='padali'):
   return {'id':OID,'customer_id':UID,'rider_id':None,'service_type':service,'status':'pending','pickup_address':'QA Pickup','dropoff_address':'QA Dropoff','pickup_lat':10.4456,'pickup_lng':123.7016,'dropoff_lat':10.46,'dropoff_lng':123.71,'notes':None,'estimated_price':60,'payment_method':'pending','payment_status':'pending','created_at':'2026-10-21T10:00:00Z','updated_at':'2026-10-21T10:00:00Z','details':{'phone':'09170000001','recipient':{'name':'QA Recipient','phone':'09170000099'}}}
  async def mock(route):
   req=route.request; url=req.url
   if '/rest/v1/' not in url: await route.continue_(); return
   endpoint=url.split('/rest/v1/')[1].split('?')[0]; data=None
   if req.method in ['POST','PATCH','DELETE']: calls.append((endpoint,req.post_data_json))
   if endpoint.startswith('rpc/'):
    fn=endpoint[4:]; body=req.post_data_json or {}
    if fn=='create_order':
     rows[:]=[order(body['p_service_type'])]; rows[0]['details']=body['p_details']; data=OID
    elif fn=='set_order_payment_method':
     rows[0]['payment_method']=body['p_method']; rows[0]['payment_status']='cod' if body['p_method']=='cod' else 'pending'; rows[0]['details']['payment_reference']=body.get('p_reference'); data=None
    elif fn=='list_available_jobs': data=[r for r in rows if r['status']=='pending' and not r['rider_id']]
    elif fn=='get_order_contacts': data=[{'customer_name':'QA Customer','customer_phone':'09170000001','rider_name':'QA Rider','rider_phone':'09170000011','rider_avatar_url':None}]
    elif fn=='accept_order': rows[0]['rider_id']=RID; rows[0]['status']='accepted'; rows[0]['details']['trip_stage']='enroute_pickup'
    elif fn=='advance_trip':
     stage=body['p_next_stage']; rows[0]['details']['trip_stage']=stage; rows[0]['status']='completed' if stage=='completed' else 'in_progress' if stage=='picked_up' else 'accepted'
    elif fn=='cancel_my_order': rows[0]['status']='cancelled'
    elif fn=='rider_cancel_settlement': settlements[0]['status']='rejected'
    elif fn=='admin_confirm_payment': rows[0]['payment_status']='paid' if body['p_confirmed'] else 'failed'
   elif endpoint=='user_roles': data=[{'user_id':UID,'role':r} for r in ['customer','rider','admin']]
   elif endpoint=='profiles': data=[{'id':UID,'full_name':'QA Account','phone':'09170000001'}]
   elif endpoint=='orders': data=rows
   elif endpoint=='driver_locations': data=[{'rider_id':RID,'order_id':OID,'lat':10.446,'lng':123.702,'speed':5,'updated_at':'2026-10-21T20:50:00Z'}]
   elif endpoint=='wallet_ledger': data=[{'id':'QA-ledger','order_id':OID,'rider_id':RID,'service_type':'ride','payment_method':'gcash','gcash_to':'hatodgo','customer_paid':200,'rider_earning':160,'platform_commission':40,'collected_by':'hatodgo','settled':False,'created_at':'2026-10-21T10:00:00Z'}]
   elif endpoint=='settlements':
    if req.method=='POST':
     body=req.post_data_json; settlements[:]=[{'id':'00000000-0000-0000-0000-00000000dd01','rider_id':RID,'status':'pending','admin_id':None,'approved_at':None,'created_at':'2026-10-21T10:00:00Z','updated_at':'2026-10-21T10:00:00Z',**body}]
    data=settlements
   else: data=[]
   if 'application/vnd.pgrst.object' in req.headers.get('accept','') and isinstance(data,list): data=data[0] if data else None
   await route.fulfill(status=200,json=data,headers={'content-range':'0-0/1'})
  await context.route('**/rest/v1/**',mock)
  await context.route('**/photon.komoot.io/**',lambda route:route.fulfill(json={'features':[{'geometry':{'coordinates':[123.7016,10.4456]},'properties':{'name':'QA Location','city':'Balamban'}}]}))
  await page.goto('http://localhost:8080'); await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
  # Full form -> RPC -> payment selection -> order readback, no real writes.
  for path,service,details in [('/services/padala','padali','QA parcel'),('/services/pabili','pabili','QA shopping'),('/services/food/manual','food','QA lunch')]:
   await page.goto('http://localhost:8080'+path,wait_until='networkidle')
   for field in ['pickup','dropoff']:
    await page.locator('#'+field).fill('QA Location'); await page.wait_for_timeout(500)
    await page.locator('#'+field).press('Enter')
   await page.locator('#details').fill(details); await page.locator('#contact_phone').fill('+63 917 000 0001')
   if service=='padali': await page.locator('#recipient_name').fill('QA Recipient'); await page.locator('#recipient_phone').fill('09170000099')
   await page.locator('button[type=submit]').click(); await page.wait_for_url('**/checkout/'+OID)
   assert rows[0]['details']['phone']=='09170000001'
   await page.get_by_role('button',name='GCash / Maya').click(); await page.wait_for_timeout(1800)
   print('payment URL',page.url,'headings',await page.locator('h1').all_text_contents()); await page.screenshot(path=str(OUT/'fixture_payment.png')); await page.locator('#pay-ref').fill('MAYA-1234'); await page.get_by_role('button',name='Maya',exact=False).click(); await page.wait_for_url('**/success')
   assert rows[0]['payment_status']=='pending'; assert rows[0]['details']['payment_reference']=='MAYA-1234'
   await page.goto('http://localhost:8080/orders',wait_until='networkidle'); assert await page.get_by_text('Awaiting manual confirmation',exact=True).count()==1
   print('fixture customer',service,'created, reference saved, pending readback PASS')
  # Restaurant cart with local fixture contents.
  await page.goto('http://localhost:8080/services/food/cart')
  await page.evaluate('(cart)=>localStorage.setItem("hatodgo:food-cart:v1",JSON.stringify(cart))', {'restaurant':{'id':'00000000-0000-0000-0000-00000000ee01','name':'QA Restaurant','address':'QA Pickup','lat':10.4456,'lng':123.7016,'base_delivery_fee':30,'per_km_fee':7,'free_distance_km':2,'estimated_minutes':30},'lines':[{'menu_item_id':'00000000-0000-0000-0000-00000000ff01','name':'QA Lunch','price':120,'quantity':2}]})
  await page.reload(wait_until='networkidle'); await page.locator('#dropoff').fill('QA Location'); await page.wait_for_timeout(500); await page.locator('#dropoff').press('Enter'); await page.locator('#phone').fill('09170000001')
  await page.get_by_role('button',name='Continue to payment',exact=False).click(); await page.wait_for_url('**/checkout/'+OID); assert rows[0]['details']['items'][0]['quantity']==2
  print('fixture restaurant cart checkout PASS')
  # Edited address must invalidate pin and prevent another order call.
  await page.goto('http://localhost:8080/services/padala',wait_until='networkidle')
  for field in ['pickup','dropoff']:
   await page.locator('#'+field).fill('QA Location'); await page.wait_for_timeout(500); await page.locator('#'+field).press('Enter')
  await page.locator('#pickup').fill('Different address'); await page.locator('#details').fill('QA parcel')
  before=len(calls); await page.locator('button[type=submit]').click(); await page.wait_for_timeout(300); assert len(calls)==before
  print('edited pin invalidation PASS')
  # Ride -> COD checkout.
  await page.goto('http://localhost:8080/services/ride',wait_until='networkidle')
  for field in ['pickup','dropoff']:
   await page.locator('#'+field).fill('QA Location'); await page.wait_for_timeout(500); await page.locator('#'+field).press('Enter')
  print('ride buttons',await page.get_by_role('button').all_text_contents())
  await page.get_by_role('button',name='Find',exact=False).click(); await page.wait_for_url('**/checkout/'+OID)
  await page.get_by_role('button',name='Pay with Cash').click(); await page.wait_for_url('**/success'); assert rows[0]['payment_status']=='cod'
  print('fixture ride COD PASS')
  # Rider atomic claim and valid steps.
  rows[:]=[order()]
  await page.goto('http://localhost:8080/driver',wait_until='networkidle'); await page.get_by_role('button',name='Accept Order',exact=False).first.click(); await page.wait_for_timeout(800)
  assert rows[0]['status']=='accepted'; await page.wait_for_timeout(1500); await page.screenshot(path=str(OUT/'fixture_rider.png')); print('call links',await page.locator('a[href^=tel]').evaluate_all('(xs)=>xs.map(x=>x.getAttribute("href"))')); assert await page.locator('a[href="tel:09170000001"]').count()>0
  for name,stage in [('Arrived at Pickup','arrived_pickup'),('Picked Up','picked_up'),('Complete Order','completed')]:
   await page.get_by_role('button',name=name,exact=False).first.click(); await page.wait_for_timeout(500); assert rows[0]['details']['trip_stage']==stage
  print('fixture rider claim/contact/stages PASS')
  # Active customer tracker with fixture GPS.
  rows[0]['status']='accepted'; rows[0]['details']['trip_stage']='enroute_pickup'
  await page.goto('http://localhost:8080/orders',wait_until='networkidle'); assert await page.get_by_text('Rider arriving in',exact=True).count()==1
  await page.get_by_text('Rider arriving in',exact=True).screenshot(path=str(OUT/'fixture_eta.png'))
  # Admin manual confirmation.
  rows[0]['payment_method']='gcash'; rows[0]['payment_status']='pending'; rows[0]['details']['payment_reference']='GCASH-1234'
  await page.goto('http://localhost:8080/admin',wait_until='networkidle'); await page.get_by_role('button',name='Confirm paid',exact=True).click(); await page.get_by_role('button',name='Yes, confirm paid',exact=True).click(); await page.wait_for_timeout(500); assert rows[0]['payment_status']=='paid'
  print('fixture admin manual payment confirmation PASS')
  # A pending payout request fixture stays pending until explicitly cancelled.
  await page.goto('http://localhost:8080/driver/wallet',wait_until='networkidle'); await page.get_by_role('button',name='Request payout',exact=True).click()
  await page.locator('#amt').fill('100'); await page.locator('#ref').fill('09170000011')
  from PIL import Image
  Image.new('RGB',(10,10),'white').save(OUT/'qa_receipt.png')
  await page.locator('#receipt').set_input_files(OUT/'qa_receipt.png')
  # Storage is mocked too; never upload a shared receipt.
  await context.route('**/storage/v1/**',lambda route:route.fulfill(status=200,json={'Key':'QA receipt'}))
  await page.get_by_role('button',name='Submit',exact=True).click(); await page.wait_for_timeout(800); assert settlements[0]['status']=='pending'
  print('fixture payout request stays pending PASS')
  print('wallet buttons',await page.get_by_role('button').all_text_contents())
  await page.get_by_role('button',name='Cancel',exact=True).click(); await page.get_by_role('button',name='Yes, cancel',exact=False).click(); await page.wait_for_timeout(500); assert settlements[0]['status']=='rejected'
  print('fixture rider payout cancellation PASS')
  await page.screenshot(path=str(OUT/'fixture_wallet_cancel.png'))
  print('mocked_mutations',len(calls),'page_errors',errors)
  await browser.close()
asyncio.run(main())
