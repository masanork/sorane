import { expect, test, type Page, type BrowserContext, type APIRequestContext } from "@playwright/test";

test.use({launchOptions:{args:["--enable-features=WebMCP"]},serviceWorkers:"block",ignoreHTTPSErrors:true});
const ADMIN = "https://localhost:4174";
async function openInbox(page: Page, context: BrowserContext, request: APIRequestContext, role="owner") {
  const {cookie} = await (await request.get(`/__contact-test/login/${role}`)).json();
  await context.addCookies(cookie.split("; ").map((pair: string)=>{
    const [name,...value] = pair.split("=");
    return {name,value:value.join("="),url:ADMIN,secure:true,httpOnly:true,sameSite:"Lax" as const};
  }));
  return await page.goto(ADMIN+"/sites/native/inquiries");
}

test("native WebMCP draft requires consent and manual send; receipt appears in the private owner inbox",async({page,context,request})=>{
  let posts=0;page.on("request",r=>{if(r.method()==="POST"&&r.url().endsWith("/_contact"))posts++;});
  await page.goto("/native/contact.html");
  await expect.poll(()=>page.evaluate(async()=>((await (document as any).modelContext.getTools()) as any[]).map(t=>t.name))).toContain("prepare_contact");
  const subject="Browser inquiry "+Date.now();
  const result = await page.evaluate(async(subject)=>{
    const context=(document as any).modelContext;
    const tool=(await context.getTools()).find((t:any)=>t.name==="prepare_contact");
    const input={fields:{name:"Browser visitor",email:"browser@example.test",subject,body:'<img src=x onerror="window.injected=true">\nPlease explain WebMCP.'}};
    const response=await context.executeTool(tool,typeof tool.inputSchema==="string"?JSON.stringify(input):input);
    return typeof response==="string"?JSON.parse(response):response;
  },subject);
  expect(result).toMatchObject({submitted:false,requires_user_submission:true});
  expect(posts).toBe(0);
  await expect(page.locator('[name=consent]')).not.toBeChecked();
  await page.getByRole("button",{name:"問い合わせを送信"}).click();
  expect(posts).toBe(0);
  await page.locator('[name=consent]').check();
  await page.getByRole("button",{name:"問い合わせを送信"}).click();
  await expect(page.locator('[data-sorane-contact-status]')).toContainText("問い合わせを受け付けました");
  expect(posts).toBe(1);
  await expect(page.locator('[name=email]')).toHaveValue("");
  const receipt=(await page.locator('[data-sorane-contact-status]').textContent())!.split("受付番号：")[1];
  await openInbox(page,context,request);
  await page.getByRole("link",{name:subject}).click();
  await expect(page.getByRole("heading",{name:subject})).toBeVisible();
  await expect(page.locator('pre')).toContainText('<img src=x onerror="window.injected=true">');
  await expect(page.locator('pre img')).toHaveCount(0);
  expect(await page.evaluate(()=>(window as any).injected)).toBeUndefined();
  await expect(page.locator('main')).toContainText(receipt);
  await page.getByLabel("対応状況",{exact:true}).selectOption("in_progress");
  const saved = page.waitForResponse(r=>r.request().method()==="POST" && r.url().startsWith(ADMIN+"/api/sites/native/inquiries/"));
  await page.getByRole("button",{name:"対応状況を保存"}).click();
  const response = await saved;
  expect(response.status(),response.status()===303 ? undefined : await response.text()).toBe(303);
  await expect(page).toHaveURL(ADMIN+"/sites/native/inquiries/"+receipt);
  await expect(page.getByLabel("対応状況",{exact:true})).toHaveValue("in_progress");
  await page.getByRole("link",{name:"受信箱へ戻る"}).click();
  await page.getByLabel("対応状況",{exact:true}).selectOption("in_progress");
  await page.getByRole("button",{name:"絞り込む"}).click();
  await expect(page.getByRole("link",{name:subject})).toBeVisible();
});

test("a lost API response leaves input intact and retry stores one inquiry",async({page,request})=>{
  const subject="Retry inquiry "+Date.now();let receipt:string|undefined,first=true;
  await page.route("**/native/_contact",async(route)=>{
    const response=await route.fetch();
    if(first){first=false;receipt=(await response.json()).receipt;await route.abort('failed');}
    else await route.fulfill({response});
  });
  await page.goto('/native/contact.html');
  await page.getByLabel('返信先メールアドレス').fill('retry@example.test');
  await page.getByLabel('件名',{exact:true}).fill(subject);
  await page.getByLabel('お問い合わせ内容').fill('Keep this draft after a network error.');
  await page.locator('[name=consent]').check();
  await page.getByRole('button',{name:'問い合わせを送信'}).click();
  await expect(page.locator('[data-sorane-contact-status]')).toContainText('通信を確認できませんでした');
  await expect(page.locator('[name=body]')).toHaveValue('Keep this draft after a network error.');
  await page.getByRole('button',{name:'問い合わせを送信'}).click();
  await expect(page.locator('[data-sorane-contact-status]')).toContainText(receipt!);
  const inbox=await (await request.get('/__contact-test/inbox')).json();
  expect(inbox.inquiries.filter((i:any)=>i.subject===subject)).toHaveLength(1);
});

test("a viewer cannot open the inquiry inbox",async({page,context,request})=>{
  const response=await openInbox(page,context,request,'viewer');
  expect(response!.status()).toBe(403);
  await expect(page.getByRole('heading',{name:'問い合わせ受信箱'})).toHaveCount(0);
});

test("a Pages form reaches the same-origin API and the private owner inbox",async({page,context,request})=>{
  const subject="Pages inquiry "+Date.now();
  await page.goto('/pages/contact.html');
  await page.getByLabel('返信先メールアドレス').fill('pages-browser@example.test');
  await page.getByLabel('件名',{exact:true}).fill(subject);
  await page.getByLabel('お問い合わせ内容').fill('This form is served separately from the API Worker.');
  await page.locator('[name=consent]').check();
  const sent=page.waitForResponse(r=>new URL(r.url()).pathname==='/_contact' && r.request().method()==='POST');
  await page.getByRole('button',{name:'問い合わせを送信'}).click();
  expect((await sent).status()).toBe(201);
  await expect(page.locator('[data-sorane-contact-status]')).toContainText('問い合わせを受け付けました');
  await openInbox(page,context,request);
  await page.getByRole('link',{name:subject}).click();
  await expect(page.getByRole('heading',{name:subject})).toBeVisible();
});

test("previewing a generated form cannot submit a live inquiry",async({page,request})=>{
  const {url}=await (await request.get('/__contact-test/preview')).json();
  const preview=new URL(url);
  let sent=0;page.on('request',r=>{if(r.method()==='POST')sent++;});
  await page.goto(preview.pathname+'contact.html');
  await expect(page.getByRole('button',{name:'問い合わせを送信'})).toBeDisabled();
  await expect(page.locator('[data-sorane-contact-status]')).toContainText('プレビューでは問い合わせを送信できません');
  expect(sent).toBe(0);
});

test("the native form submits without JavaScript",async({browser})=>{
  const context=await browser.newContext({javaScriptEnabled:false,baseURL:'http://127.0.0.1:4173'});
  const page=await context.newPage();
  await page.goto('/native/contact.html');
  await page.getByLabel('返信先メールアドレス').fill('plain-browser@example.test');
  await page.getByLabel('件名',{exact:true}).fill('Plain browser inquiry');
  await page.getByLabel('お問い合わせ内容').fill('JavaScript is disabled.');
  await page.locator('[name=consent]').check();
  await page.getByRole('button',{name:'問い合わせを送信'}).click();
  await expect(page).toHaveURL(/\/native\/_contact$/);
  await expect(page.locator('body')).toContainText('問い合わせを受け付けました');
  await context.close();
});

test("contact fields fit a mobile viewport",async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/native/contact.html');
  await expect(page.getByLabel('お問い合わせ内容')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.sorane-contact').screenshot({path:testInfo.outputPath('contact-mobile.png')});
});
