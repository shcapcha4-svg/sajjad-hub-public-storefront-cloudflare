const $=s=>document.querySelector(s);
let products=[],orders=[],notifications=[],objectPreviewUrl=null;
let members=[];
let salesSummary=null,salesPeriod='daily',downloadRows=[];
const money=n=>'৳'+Number(n||0).toLocaleString('bn-BD');
const bn=n=>Number(n||0).toLocaleString('bn-BD');
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function api(url,options={}){const r=await fetch(url,options);let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.message||'অনুরোধ ব্যর্থ হয়েছে');return d}
function applyTheme(theme){document.body.dataset.theme=theme;const b=$('#themeToggle');if(b){b.innerHTML=theme==='dark'?'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>';b.title=theme==='dark'?'লাইট মোড':'ডার্ক মোড';b.setAttribute('aria-label',theme==='dark'?'লাইট মোড চালু করুন':'ডার্ক মোড চালু করুন')}try{localStorage.setItem('sajjadhub-admin-theme',theme)}catch{}}
try{applyTheme(localStorage.getItem('sajjadhub-admin-theme')||'light')}catch{applyTheme('light')}
document.addEventListener('click',e=>{if(e.target.closest('#themeToggle'))applyTheme(document.body.dataset.theme==='dark'?'light':'dark')});
function message(el,text,error=false){el.textContent=text;el.classList.toggle('error',error)}
function showAdminPage(key){
 document.querySelectorAll('[data-admin-section]').forEach(section=>section.hidden=section.dataset.adminSection!==key);
 document.querySelectorAll('[data-admin-nav]').forEach(button=>{if(button.tagName==='BUTTON'&&button.dataset.adminNav){if(button.dataset.adminSection===key)button.setAttribute('aria-current','page');else if(button.closest('.admin-nav')){if(button.dataset.adminNav===key)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')}}});
 try{localStorage.setItem('sajjadhub-admin-page',key)}catch{}
}
document.addEventListener('click',e=>{const button=e.target.closest('[data-admin-nav]');if(button)showAdminPage(button.dataset.adminNav)});
try{showAdminPage(localStorage.getItem('sajjadhub-admin-page')||'overview')}catch{showAdminPage('overview')}
function parseAdminDate(value){if(!value)return null;const raw=String(value).trim();const normalized=raw.includes('T')?raw:raw.replace(' ','T');return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(normalized)?normalized:normalized+'Z')}
function bdDateKey(value){const date=parseAdminDate(value);if(!date||Number.isNaN(date.getTime()))return '';return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)}
function adminDateTime(value){const date=parseAdminDate(value);return !date||Number.isNaN(date.getTime())?'তথ্য নেই':date.toLocaleString('bn-BD',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'})}
function updateOverview(){ $('#overviewProducts').textContent=bn(products.length);$('#overviewOrders').textContent=bn(orders.length);$('#overviewMembers').textContent=bn(members.length)}
function showDashboard(){ $('#loginView').hidden=true;$('#dashboard').hidden=false;loadAll() }
async function check(){try{const d=await api('/api/admin/me');if(d.success){showDashboard();return}}catch{}$('#loginView').hidden=false}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();message($('#loginMessage'),'লগইন হচ্ছে...');try{await api('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#password').value})});showDashboard()}catch(err){message($('#loginMessage'),err.message,true)}});
$('#logout').onclick=async()=>{try{await api('/api/admin/logout',{method:'POST'})}finally{location.reload()}};
async function loadAll(){try{await loadProducts()}catch(error){message($('#productMessage'),error.message,true)}await Promise.allSettled([loadHeroDesigns(),loadOrders(),loadNotifications(),loadCustomers(),loadSalesSummary(),loadDownloads()]);updateOverview()}
async function loadProducts(){const d=await api('/api/admin/products');products=d.products||[];renderProducts();renderHeroDesignOptions()}
async function inspectHeroArtwork(file){
  if(file.size>2*1024*1024)throw new Error("ছবির ফাইল ২ MB-এর মধ্যে হতে হবে।");
  let width=0,height=0;
  if("createImageBitmap" in window){const bitmap=await createImageBitmap(file);width=bitmap.width;height=bitmap.height;bitmap.close();}
  else{const url=URL.createObjectURL(file);try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url});width=image.naturalWidth;height=image.naturalHeight}finally{URL.revokeObjectURL(url)}}
  if(width!==1200||height!==1600)throw new Error("ছবির মাপ অবশ্যই 1200 × 1600 px হতে হবে।");
  return {width,height};
}
function renderHeroDesignOptions(){
  const first=$('#heroDesignOne').value,second=$('#heroDesignTwo').value;
  const options='<option value="">ডিজাইন নির্বাচন করুন</option>'+products.filter(p=>p.active&&p.imageUrl).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · #'+esc(p.id)+'</option>').join('');
  $('#heroDesignOne').innerHTML=options;$('#heroDesignTwo').innerHTML=options;
  if(products.some(p=>p.active&&p.imageUrl&&String(p.id)===first))$('#heroDesignOne').value=first;
  if(products.some(p=>p.active&&p.imageUrl&&String(p.id)===second))$('#heroDesignTwo').value=second;
  renderHeroDesignPreviews();
}
function renderHeroDesignPreviews(){
  (window.heroPreviewObjectUrls||[]).forEach(url=>URL.revokeObjectURL(url));window.heroPreviewObjectUrls=[];
  const ids=[$('#heroDesignOne').value,$('#heroDesignTwo').value];
  const existing=window.heroDesignSettings||{};
  const files=[$('#heroImageOne').files[0],$('#heroImageTwo').files[0]];
  const urls=[existing.firstImageUrl,existing.secondImageUrl];
  $('#heroAdminPreviews').innerHTML=ids.map((id,index)=>{
    const p=products.find(item=>String(item.id)===String(id));
    let src=urls[index];if(files[index]){src=URL.createObjectURL(files[index]);window.heroPreviewObjectUrls.push(src);}
    return '<div class="hero-admin-preview">'+(src?'<img src="'+esc(src)+'" alt="নির্বাচিত পোস্টার ছবি">':'<div class="admin-empty">আলাদা পোস্টার ছবি আপলোড করুন</div>')+(p?'<strong>'+(index===0?'পেছনের সোর্স: ':'সামনের সোর্স: ')+esc(p.name)+'</strong>':'<strong>সোর্স ডিজাইন নির্বাচন করুন</strong>')+'</div>';
  }).join('');
}
async function loadHeroDesigns(){
  renderHeroDesignOptions();
  const d=await api('/api/admin/hero-designs');
  window.heroDesignSettings=d.designs||{};
  $('#heroDesignOne').value=String(d.designs?.firstId||'');
  $('#heroDesignTwo').value=String(d.designs?.secondId||'');
  $('#heroImageOneName').textContent=d.designs?.firstImageKey?'আগের ছবি সংরক্ষিত আছে':'কোনো ছবি নির্বাচন করা হয়নি';
  $('#heroImageTwoName').textContent=d.designs?.secondImageKey?'আগের ছবি সংরক্ষিত আছে':'কোনো ছবি নির্বাচন করা হয়নি';
  $('#heroImageOne').value='';$('#heroImageTwo').value='';
  renderHeroDesignPreviews();
  message($('#heroDesignMessage'),'সংরক্ষিত হোমপেজ ডিজাইন লোড হয়েছে।');
}
$('#heroDesignOne').addEventListener('change',renderHeroDesignPreviews);
$('#heroDesignTwo').addEventListener('change',renderHeroDesignPreviews);
async function handleHeroArtworkChange(input,nameEl){const file=input.files[0];if(file){try{await inspectHeroArtwork(file);nameEl.textContent=file.name+" · 1200 × 1600 px"}catch(error){input.value="";nameEl.textContent=error.message;message($('#heroDesignMessage'),error.message,true)}}else{nameEl.textContent='আগের ছবি অপরিবর্তিত থাকবে'}renderHeroDesignPreviews()}
$('#heroImageOne').addEventListener('change',()=>handleHeroArtworkChange($('#heroImageOne'),$('#heroImageOneName')));
$('#heroImageTwo').addEventListener('change',()=>handleHeroArtworkChange($('#heroImageTwo'),$('#heroImageTwoName')));
$('#refreshHeroDesigns').addEventListener('click',()=>loadHeroDesigns().catch(error=>message($('#heroDesignMessage'),error.message,true)));
$('#heroDesignsForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const firstId=$('#heroDesignOne').value,secondId=$('#heroDesignTwo').value,button=$('#saveHeroDesigns');
  if(!firstId||!secondId||firstId===secondId){message($('#heroDesignMessage'),'দুটি আলাদা ডিজাইন নির্বাচন করুন।',true);return;}
  try{for(const input of [$('#heroImageOne'),$('#heroImageTwo')])if(input.files[0])await inspectHeroArtwork(input.files[0]);}
  catch(error){message($('#heroDesignMessage'),error.message,true);return;}
  button.disabled=true;message($('#heroDesignMessage'),'হোমপেজের ডিজাইন সংরক্ষণ হচ্ছে...');
  try{
    const data=new FormData();data.append('firstId',firstId);data.append('secondId',secondId);
    if($('#heroImageOne').files[0])data.append('firstImage',$('#heroImageOne').files[0]);
    if($('#heroImageTwo').files[0])data.append('secondImage',$('#heroImageTwo').files[0]);
    const result=await api('/api/admin/hero-designs',{method:'PUT',body:data});
    window.heroDesignSettings={...window.heroDesignSettings,...result.designs};
    $('#heroImageOne').value='';$('#heroImageTwo').value='';
    $('#heroImageOneName').textContent='ছবি সংরক্ষিত আছে';$('#heroImageTwoName').textContent='ছবি সংরক্ষিত আছে';
    message($('#heroDesignMessage'),'সফল! সোর্স ডিজাইন ও আলাদা পোস্টার ছবি সংরক্ষণ হয়েছে।');renderHeroDesignPreviews();
  }
  catch(error){message($('#heroDesignMessage'),error.message,true)}
  finally{button.disabled=false}
});
function filteredProducts(){const q=$('#productSearch').value.trim().toLowerCase(),f=$('#productFilter').value,from=$('#productDateFrom')?.value||'',to=$('#productDateTo')?.value||'';return products.filter(p=>{const matches=String(p.name||'').toLowerCase().includes(q)||String(p.category||'').toLowerCase().includes(q)||String(p.tag||'').toLowerCase().includes(q);const state=f==='active'?p.active:f==='hidden'?!p.active:f==='file'?p.hasFile:f==='missing'?!p.hasFile:true;const date=bdDateKey(p.createdAt);return matches&&state&&(!from||date>=from)&&(!to||date<=to)})}
function productTagList(value){return String(value||'').split(',').map(x=>x.trim()).filter(Boolean)}
function productPriceMarkup(p){const offer=Number(p.offerPrice);return p.offerPrice!==null&&p.offerPrice!==''&&Number.isFinite(offer)&&offer>=0&&offer<Number(p.price)?'<span class="admin-old-price">'+money(p.price)+'</span><strong class="admin-offer-price">'+money(offer)+'</strong>':money(p.price)}
function renderProducts(){const list=filteredProducts();$('#productCount').textContent=bn(list.length)+' / '+bn(products.length)+'টি পণ্য';$('#products').innerHTML='<div class="admin-table-wrap"><table class="admin-data-table"><thead><tr><th>পণ্য</th><th>ক্যাটাগরি</th><th>আপলোডের সময়</th><th>মূল্য</th><th>অবস্থা</th><th>ফাইল</th><th>কার্যক্রম</th></tr></thead><tbody>'+list.map(p=>'<tr><td><a href="/product/'+encodeURIComponent(p.id)+'" target="_blank" rel="noopener">'+esc(p.name)+'</a></td><td>'+esc(p.category)+'</td><td>'+esc(adminDateTime(p.createdAt))+'</td><td>'+productPriceMarkup(p)+'</td><td>'+(p.active?'প্রকাশিত':'লুকানো')+'</td><td>'+(p.hasFile?'যুক্ত':'নেই')+'</td><td><div class="admin-actions"><button class="admin-btn light small" data-action="preview" data-id="'+esc(p.id)+'">প্রিভিউ</button><button class="admin-btn small" data-action="edit" data-id="'+esc(p.id)+'">এডিট</button><button class="admin-btn light small" data-action="hide" data-id="'+esc(p.id)+'">'+(p.active?'লুকান':'প্রকাশ')+'</button><button class="admin-btn danger small" data-action="delete" data-id="'+esc(p.id)+'">ডিলিট</button></div></td></tr>').join('')+'</tbody></table></div>'+(list.length?'':'<div class="admin-empty">এই তারিখ বা ফিল্টারে কোনো পণ্য পাওয়া যায়নি।</div>')}
$('#products').addEventListener('click',async e=>{const b=e.target.closest('button[data-action]');if(!b)return;const p=products.find(x=>String(x.id)===String(b.dataset.id));if(!p)return;const action=b.dataset.action;if(action==='preview'||action==='details'){openProductModal(p,action);return}if(action==='edit'){editProduct(p);return}if(action==='delete'){const ok=confirm('“'+p.name+'” ডিজাইনটি অ্যাডমিন ও ওয়েবসাইট থেকে স্থায়ীভাবে সরাবেন? অর্ডার ইতিহাস থাকলে পুরোনো ক্রেতার ডাউনলোড ঠিক রাখতে সংরক্ষিত কপি আর্কাইভে থাকবে।');if(!ok)return;b.disabled=true;try{const result=await api('/api/admin/products/'+encodeURIComponent(p.id)+'/permanent-delete',{method:'POST'});message($('#productMessage'),result.message||'ডিজাইনটি স্থায়ীভাবে ডিলিট হয়েছে।');products=products.filter(item=>String(item.id)!==String(p.id));renderProducts();await loadProducts()}catch(err){message($('#productMessage'),err.message,true)}finally{b.disabled=false}return}if(action==='hide'){const publishing=!p.active;if(!confirm(publishing?'এই ডিজাইনটি আবার সাইটে প্রকাশ করবেন?':'এই ডিজাইনটি সাইট থেকে লুকাবেন?'))return;b.disabled=true;try{if(publishing){await api('/api/admin/products/'+encodeURIComponent(p.id)+'/publish',{method:'POST'});message($('#productMessage'),'ডিজাইনটি আবার ওয়েবসাইটে প্রকাশ করা হয়েছে।')}else{await api('/api/admin/products/'+encodeURIComponent(p.id),{method:'DELETE'});message($('#productMessage'),'ডিজাইনটি সাইট থেকে লুকানো হয়েছে।')}await loadProducts()}catch(err){message($('#productMessage'),err.message,true)}finally{b.disabled=false}}});
function openProductModal(p,mode){const image=p.imageUrl?`<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}">`:'<div class="admin-empty">প্রিভিউ ছবি যুক্ত নেই</div>';$('#productModalContent').innerHTML=mode==='preview'?`<div><div class="admin-eyebrow">PRODUCT PREVIEW</div><h2>${esc(p.name)}</h2>${image}</div>`:`<div class="admin-eyebrow">PRODUCT DETAILS</div><div class="modal-product">${image}<div><span class="admin-tag">${esc(p.category)}</span><h2>${esc(p.name)}</h2>${productTagList(p.tag).length?`<div class="admin-product-tags">${productTagList(p.tag).map(t=>`<span>#${esc(t)}</span>`).join('')}</div>`:''}<div class="modal-price">${productPriceMarkup(p)}</div><p>${esc(p.description||'কোনো বিবরণ দেওয়া হয়নি।')}</p><div class="modal-file">প্রিভিউ ছবি: ${p.imageUrl?'যুক্ত আছে':'নেই'}<br>ডাউনলোড ফাইল: ${p.hasFile?'যুক্ত আছে':'নেই'}<br>স্টোরফ্রন্ট: ${p.active?'প্রকাশিত':'লুকানো'}</div></div></div>`;$ ('#productModal').showModal()}
function editProduct(p){showAdminPage('upload');const f=$('#productForm');$('#productId').value=p.id;for(const k of ['name','category','price','description','tag'])f.elements[k].value=p[k]??'';f.elements.offerPrice.value=p.offerPrice??'';$('#formTitle').textContent='ডিজাইন এডিট করুন';$('#saveProduct').textContent='পরিবর্তন সংরক্ষণ করুন';$('#existingAssets').hidden=false;$('#existingAssets').innerHTML=`বর্তমান প্রিভিউ: ${p.imageUrl?'ছবি যুক্ত আছে':'ছবি নেই'} · ডাউনলোড ফাইল: ${p.hasFile?'যুক্ত আছে':'নেই'}। নতুন ফাইল না বাছলে আগের ফাইল থাকবে।`;$('#cancelEdit').hidden=false;updateUploadPreview();$('#uploadPanel').scrollIntoView({behavior:'smooth',block:'start'})}
function clearObjectPreview(){if(objectPreviewUrl){URL.revokeObjectURL(objectPreviewUrl);objectPreviewUrl=null}}
function updateUploadPreview(){const f=$('#productForm'),name=f.elements.name.value.trim()||'ডিজাইনের নাম',price=f.elements.price.value?money(f.elements.price.value):'মূল্য নির্ধারণ হয়নি',offer=f.elements.offerPrice.value?money(f.elements.offerPrice.value):'';$('#uploadPreviewMeta').textContent=name+' · '+(offer?'অফার '+offer+' (আগে '+price+')':price);const file=$('#imageInput').files[0];if(file){clearObjectPreview();objectPreviewUrl=URL.createObjectURL(file);$('#uploadPreviewImage').innerHTML=`<img src="${objectPreviewUrl}" alt="নির্বাচিত প্রিভিউ">`}else if(!$('#productId').value){$('#uploadPreviewImage').textContent='এখানে ছবির প্রিভিউ দেখা যাবে'} }
$('#productForm').elements.name.addEventListener('input',updateUploadPreview);$('#productForm').elements.price.addEventListener('input',updateUploadPreview);$('#productForm').elements.offerPrice.addEventListener('input',updateUploadPreview);
$('#imageInput').addEventListener('change',()=>{$('#imageFileName').textContent=$('#imageInput').files[0]?.name||'কোনো ছবি নির্বাচন করা হয়নি';updateUploadPreview()});
$('#fileInput').addEventListener('change',()=>{$('#downloadFileName').textContent=$('#fileInput').files[0]?.name||'কোনো ফাইল নির্বাচন করা হয়নি'});
function resetForm(){clearObjectPreview();$('#productForm').reset();$('#productId').value='';$('#formTitle').textContent='নতুন ডিজাইন আপলোড';$('#saveProduct').textContent='পণ্য সংরক্ষণ করুন';$('#cancelEdit').hidden=true;$('#existingAssets').hidden=true;$('#existingAssets').textContent='';$('#imageFileName').textContent='কোনো ছবি নির্বাচন করা হয়নি';$('#downloadFileName').textContent='কোনো ফাইল নির্বাচন করা হয়নি';$('#uploadPreviewImage').textContent='এখানে ছবির প্রিভিউ দেখা যাবে';$('#uploadPreviewMeta').textContent='ডিজাইনের নাম ও মূল্য দিলে এখানে দেখা যাবে।'}
$('#cancelEdit').onclick=resetForm;
$('#productForm').addEventListener('submit',async e=>{e.preventDefault();const id=$('#productId').value,fd=new FormData(e.currentTarget);const btn=$('#saveProduct');btn.disabled=true;message($('#productMessage'),'ফাইল ও তথ্য সংরক্ষণ হচ্ছে...');try{await api(id?'/api/admin/products/'+id:'/api/admin/products',{method:id?'PUT':'POST',body:fd});message($('#productMessage'),id?'ডিজাইন সফলভাবে আপডেট হয়েছে।':'নতুন ডিজাইন সফলভাবে আপলোড হয়েছে।');resetForm();await loadProducts()}catch(err){message($('#productMessage'),err.message,true)}finally{btn.disabled=false}});
$('#productSearch').addEventListener('input',renderProducts);$('#productFilter').addEventListener('change',renderProducts);$('#productDateFrom').addEventListener('change',renderProducts);$('#productDateTo').addEventListener('change',renderProducts);

async function loadNotifications(){const d=await api('/api/admin/notifications');notifications=d.notifications||[];renderNotifications()}
function renderNotifications(){const rows=notifications.filter(n=>n.is_active);$('#adminNotifications').innerHTML='<div class="admin-table-wrap"><table class="admin-data-table"><thead><tr><th>শিরোনাম</th><th>ধরন</th><th>প্রাপক</th><th>প্রকাশের সময়</th><th>কার্যক্রম</th></tr></thead><tbody>'+rows.map(n=>'<tr><td>'+esc(n.title)+'<br><small>'+esc(n.message)+'</small></td><td>'+esc(n.type)+'</td><td>'+(n.target_email?esc(n.target_email)+' · #'+esc(n.target_order_id):'সব কাস্টমার')+'</td><td>'+esc(adminDateTime(n.created_at))+'</td><td><button class="admin-btn danger small" type="button" data-delete-notification="'+esc(n.id)+'">সরান</button></td></tr>').join('')+'</tbody></table></div>'+(rows.length?'':'<div class="admin-empty">এখনো কোনো নোটিফিকেশন প্রকাশ করা হয়নি।</div>')}
$('#notificationForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget,btn=$('#publishNotification'),data=Object.fromEntries(new FormData(form).entries());btn.disabled=true;message($('#notificationAdminMessage'),'নোটিফিকেশন প্রকাশ হচ্ছে...');try{await api('/api/admin/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});form.reset();message($('#notificationAdminMessage'),'নোটিফিকেশন সফলভাবে প্রকাশ হয়েছে।');await loadNotifications()}catch(err){message($('#notificationAdminMessage'),err.message,true)}finally{btn.disabled=false}});
$('#adminNotifications').addEventListener('click',async e=>{const b=e.target.closest('[data-delete-notification]');if(!b)return;if(!confirm('এই নোটিফিকেশনটি কাস্টমারদের কাছ থেকে সরিয়ে দেবেন?'))return;try{await api('/api/admin/notifications/'+encodeURIComponent(b.dataset.deleteNotification),{method:'DELETE'});await loadNotifications()}catch(err){alert(err.message)}});
$('#refreshNotifications').onclick=()=>loadNotifications().catch(e=>alert(e.message));
async function loadSalesSummary(){const data=await api('/api/admin/sales-summary');salesSummary=data;renderSalesSummary();message($('#salesMessage'),'বিক্রির হিসাব আপডেট হয়েছে।')}
function salesDateLabel(value,period){
 if(period==='monthly'){const [year,month]=String(value).split('-').map(Number);return new Date(Date.UTC(year,month-1,1)).toLocaleDateString('bn-BD',{month:'long',year:'numeric',timeZone:'UTC'})}
 const [year,month,day]=String(value).split('-').map(Number),date=new Date(Date.UTC(year,month-1,day));
 if(period==='weekly'){const end=new Date(date);end.setUTCDate(end.getUTCDate()+6);return date.toLocaleDateString('bn-BD',{day:'numeric',month:'short',timeZone:'UTC'})+' – '+end.toLocaleDateString('bn-BD',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})}
 return date.toLocaleDateString('bn-BD',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})
}
function renderSalesSummary(){
 if(!salesSummary)return;
 const cards=[['salesAllTime','salesAllTimeOrders',salesSummary.allTime],['salesThisWeek','salesThisWeekOrders',salesSummary.thisWeek],['salesThisMonth','salesThisMonthOrders',salesSummary.thisMonth],['salesToday','salesTodayOrders',salesSummary.today]];
 for(const [amountId,countId,item] of cards){$('#'+amountId).textContent=money(item?.sales||0);$('#'+countId).textContent=bn(item?.orders||0)+'টি Paid অর্ডার'}
 const rows=salesSummary[salesPeriod]||[];$('#salesPeriodHeading').textContent=salesPeriod==='daily'?'তারিখ':salesPeriod==='weekly'?'সপ্তাহ':'মাস';
 $('#salesBreakdown').innerHTML=rows.map(row=>'<tr><td>'+esc(salesDateLabel(row.period,salesPeriod))+'</td><td>'+bn(row.orders)+'</td><td>'+money(row.sales)+'</td></tr>').join('')||'<tr><td colspan="3">এখনো কোনো Paid বিক্রি নেই।</td></tr>';
 document.querySelectorAll('[data-sales-period]').forEach(button=>{const active=button.dataset.salesPeriod===salesPeriod;button.classList.toggle('light',!active);button.setAttribute('aria-pressed',active?'true':'false')});
}
function salesExportRows(){const rows=salesSummary?.[salesPeriod]||[];return [['সময়','Paid অর্ডার','মোট বিক্রি'],...rows.map(row=>[salesDateLabel(row.period,salesPeriod),row.orders,row.sales])]}
function exportSalesCsv(){const csv=salesExportRows().map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='sajjadhub-sales-'+salesPeriod+'.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportSalesPdf(){const rows=salesExportRows();const popup=window.open('','_blank');if(!popup){alert('PDF তৈরি করতে ব্রাউজারে নতুন উইন্ডো খোলার অনুমতি দিন।');return}const body=rows.map(row=>'<tr>'+row.map(cell=>'<td>'+esc(cell)+'</td>').join('')+'</tr>').join('');popup.onload=()=>popup.print();popup.document.write('<!doctype html><html lang="bn"><meta charset="utf-8"><title>Sajjadhub Sales Report</title><style>body{font-family:Arial,sans-serif;padding:28px;color:#172b25}h1{font-size:22px}p{color:#667085}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #dce6dd;padding:10px;text-align:left}th{background:#edf7ed}</style><h1>Sajjadhub · বিক্রির রিপোর্ট</h1><p>সময়কাল: '+esc(salesPeriod==='daily'?'দিনভিত্তিক':salesPeriod==='weekly'?'সপ্তাহভিত্তিক':'মাসভিত্তিক')+' · বাংলাদেশ সময়</p><table>'+body+'</table><p>রিপোর্ট তৈরি: '+esc(new Date().toLocaleString('bn-BD',{timeZone:'Asia/Dhaka'}))+'</p></html>');popup.document.close()}
$('#salesExportCsv').addEventListener('click',exportSalesCsv);$('#salesExportPdf').addEventListener('click',exportSalesPdf);
document.querySelectorAll('[data-sales-period]').forEach(button=>button.addEventListener('click',()=>{salesPeriod=button.dataset.salesPeriod;renderSalesSummary()}));
$('#refreshSales').addEventListener('click',()=>loadSalesSummary().catch(error=>message($('#salesMessage'),error.message,true)));
async function loadOrders(){const d=await api('/api/admin/orders');orders=(d.orders||[]).filter(o=>o.payment_method!=='TEST MODE');renderOrders()}
function filteredOrders(){const q=$('#orderSearch').value.trim().toLowerCase(),f=$('#orderFilter').value,from=$('#orderDateFrom').value,to=$('#orderDateTo').value;return orders.filter(o=>{const hay=[o.id,o.customer_name,o.buyer_email,o.sender_phone,o.trx_id].join(' ').toLowerCase(),date=bdDateKey(o.created_at);return hay.includes(q)&&(f==='all'||o.status===f)&&(!from||date>=from)&&(!to||date<=to)})}
function renderOrders(){const list=filteredOrders();$('#totalOrders').textContent=bn(orders.length);$('#paidOrders').textContent=bn(orders.filter(o=>o.status==='paid').length);$('#pendingOrders').textContent=bn(orders.filter(o=>o.status==='pending').length);$('#overviewOrders').textContent=bn(orders.length);$('#orders').innerHTML='<div class="admin-table-wrap"><table class="admin-data-table"><thead><tr><th>অর্ডার</th><th>ক্রেতা</th><th>পণ্য</th><th>TrxID / পেমেন্ট</th><th>তারিখ</th><th>অবস্থা</th><th>কার্যক্রম</th></tr></thead><tbody>'+list.map(o=>'<tr><td>#'+esc(o.id)+'<br>'+money(o.total)+'</td><td>'+esc(o.customer_name)+'<br><small>'+esc(o.buyer_email)+'</small></td><td>'+(o.items||[]).map(i=>esc(i.product_name)+' × '+i.quantity).join('<br>')+'</td><td>'+'<strong>'+esc(o.payment_method||'Nagad')+'</strong><br>'+esc(o.trx_id)+'<br>'+esc(o.sender_phone)+'</td><td>'+esc(adminDateTime(o.created_at))+'</td><td>'+esc(o.status==='paid'?'Paid':o.status==='rejected'?'Rejected':'Pending')+'</td><td><div class="admin-actions">'+(o.status!=='paid'?'<button class="admin-btn small" data-status="paid" data-id="'+esc(o.id)+'">Paid</button>':'')+(o.status!=='rejected'?'<button class="admin-btn danger small" data-status="rejected" data-id="'+esc(o.id)+'">Reject</button>':'')+'</div>'+(o.downloads||[]).map(x=>'<a target="_blank" rel="noopener" href="'+esc(x.url)+'">'+esc(x.name)+'</a>').join('<br>')+'</td></tr>').join('')+'</tbody></table></div>'+(list.length?'':'<div class="admin-empty">এই ফিল্টারে কোনো অর্ডার নেই।</div>')}
$('#orders').addEventListener('click',async e=>{const b=e.target.closest('button[data-status]');if(!b)return;const status=b.dataset.status,id=b.dataset.id;if(status==='paid'&&!confirm((orders.find(o=>String(o.id)===String(id))?.payment_method||'পেমেন্ট')+' TrxID ও টাকা যাচাই করেছেন? যাচাই করা থাকলেই Paid করুন।'))return;try{await api('/api/admin/orders/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});await loadOrders()}catch(err){alert(err.message)}});
$('#orderSearch').addEventListener('input',renderOrders);$('#orderFilter').addEventListener('change',renderOrders);$('#orderDateFrom').addEventListener('change',renderOrders);$('#orderDateTo').addEventListener('change',renderOrders);$('#refreshOrders').onclick=()=>loadOrders().catch(e=>alert(e.message));
document.addEventListener('click',e=>{const b=e.target.closest('[data-close]');if(b)$('#'+b.dataset.close).close()});
$('#productModal').addEventListener('click',e=>{if(e.target===$('#productModal'))$('#productModal').close()});
check();

async function loadDownloads(){
 const params=new URLSearchParams();if($('#downloadDateFrom').value)params.set('from',$('#downloadDateFrom').value);if($('#downloadDateTo').value)params.set('to',$('#downloadDateTo').value);if($('#downloadSearch').value.trim())params.set('q',$('#downloadSearch').value.trim());
 const data=await api('/api/admin/downloads'+(params.toString()?'?'+params.toString():''));downloadRows=data.downloads||[];renderDownloads();
}
function renderDownloads(){
 $('#downloadCount').textContent=bn(downloadRows.length)+'টি ডাউনলোড রেকর্ড · সর্বোচ্চ ১০০০টি সাম্প্রতিক রেকর্ড দেখানো হয়';
 $('#downloadsTable').innerHTML='<div class="admin-table-wrap"><table class="admin-data-table"><thead><tr><th>ক্রেতা</th><th>পণ্যের নাম</th><th>অর্ডার নম্বর</th><th>ডাউনলোডের তারিখ ও সময়</th></tr></thead><tbody>'+downloadRows.map(row=>'<tr><td>'+esc(row.customer_name||'নাম নেই')+'<br><small>'+esc(row.customer_email||'')+'</small></td><td><a href="'+esc(row.product_url)+'" target="_blank" rel="noopener">'+esc(row.product_name)+'</a></td><td>#'+esc(row.order_id)+'</td><td>'+esc(adminDateTime(row.downloaded_at))+'</td></tr>').join('')+'</tbody></table></div>'+(downloadRows.length?'':'<div class="admin-empty">এই সময়সীমায় কোনো ডাউনলোড রেকর্ড পাওয়া যায়নি। নতুন ডাউনলোড হলে এখানে দেখা যাবে।</div>');
}
$('#downloadSearch').addEventListener('input',()=>loadDownloads().catch(e=>message($('#downloadCount'),e.message,true)));
$('#downloadDateFrom').addEventListener('change',()=>loadDownloads().catch(e=>message($('#downloadCount'),e.message,true)));
$('#downloadDateTo').addEventListener('change',()=>loadDownloads().catch(e=>message($('#downloadCount'),e.message,true)));
$('#clearDownloadDates').addEventListener('click',()=>{$('#downloadDateFrom').value='';$('#downloadDateTo').value='';loadDownloads().catch(e=>message($('#downloadCount'),e.message,true))});
$('#refreshDownloads').addEventListener('click',()=>loadDownloads().catch(e=>message($('#downloadCount'),e.message,true)));
async function loadCustomers(){const d=await api('/api/admin/customers');members=d.members||[];$('#totalMembers').textContent=bn(d.total??members.length);$('#activeMembers').textContent=bn(members.filter(m=>m.is_active).length);renderCustomers()}
function renderCustomers(){const q=$('#memberSearch').value.trim().toLowerCase(),list=members.filter(m=>String(m.username||'').toLowerCase().includes(q));$('#overviewMembers').textContent=bn(members.length);$('#members').innerHTML='<div class="admin-table-wrap"><table class="admin-data-table"><thead><tr><th>ইউজারনেম</th><th>যোগদানের তারিখ</th><th>সর্বশেষ লগইন</th><th>অবস্থা</th></tr></thead><tbody>'+list.map(m=>'<tr><td>'+esc(m.username)+'</td><td>'+esc(adminDateTime(m.created_at))+'</td><td>'+esc(m.last_login_at?adminDateTime(m.last_login_at):'এখনো লগইন করেননি')+'</td><td>'+(m.is_active?'সক্রিয়':'নিষ্ক্রিয়')+'</td></tr>').join('')+'</tbody></table></div>'+(list.length?'':'<div class="admin-empty">কোনো সদস্য পাওয়া যায়নি।</div>')}
$('#memberSearch').addEventListener('input',renderCustomers);
$('#refreshMembers').addEventListener('click',()=>loadCustomers().catch(e=>alert(e.message)));

