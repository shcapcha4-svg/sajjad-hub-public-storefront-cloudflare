
/* Persistent storefront appearance preference */
(function(){
  const button=document.getElementById("themeToggle");
  const root=document.body;
  if(!button)return;
  let saved="light";
  try{saved=localStorage.getItem("sajjadhub-theme")||"light"}catch(e){}
  function applyTheme(mode){
    const dark=mode==="dark";
    root.dataset.theme=dark?"dark":"light";
    button.textContent=dark?"☀ লাইট":"☾ ডার্ক";
    button.setAttribute("aria-label",dark?"লাইট মোড চালু করুন":"ডার্ক মোড চালু করুন");
    document.querySelectorAll(".brand img").forEach(img=>{img.src=dark?"/sajjadhub-logo-dark.svg":"/sajjadhub-logo.svg"});
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute("content",dark?"#111827":"#101828");
  }
  applyTheme(saved);
  button.addEventListener("click",()=>{
    const next=root.dataset.theme==="dark"?"light":"dark";
    applyTheme(next);
    try{localStorage.setItem("sajjadhub-theme",next)}catch(e){}
  });
})();

// আগের আটটি নমুনা পণ্য সরানো হয়েছে; এখন শুধু Admin থেকে আপলোড করা পণ্য দেখাবে।
let products = [];
const money = n => "৳" + Number(n).toLocaleString("bn-BD");
let cart = [];
const grid = document.getElementById("productGrid");
const search = document.getElementById("searchInput");
const filter = document.getElementById("categoryFilter");
const productImageUrls = new Map();
const purchaseStatusByProduct = new Map();
const PURCHASE_STORAGE_KEY = "sajjadhub-purchases";
function escapeHTML(value="") { return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
function productArtwork(p, extraClass="") {
  if (p.imageUrl) return `<img class="${extraClass}" src="${escapeHTML(p.imageUrl)}" alt="${escapeHTML(p.name)}" loading="lazy">`;
  return `<div class="sample-art ${extraClass}" style="background:${escapeHTML(p.bg||"#e5e7eb")};color:${escapeHTML(p.ink||"#344054")}"><small>${escapeHTML(p.tag||"SAJJADHUB")}</small><strong>${p.title||"DESIGN"}</strong><small>${escapeHTML(p.sub||"DIGITAL DESIGN")}</small></div>`;
}
function renderProducts(){
  const q=search.value.trim().toLowerCase(), c=filter.value;
  const shown=products.filter(p=>(c==="সব"||p.category===c)&&(p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q)));
  grid.innerHTML=shown.map(p=>`<article class="product-card" data-product="${escapeHTML(p.id)}" tabindex="0" role="button" aria-label="${escapeHTML(p.name)} বিস্তারিত দেখুন"><button class="product-open" type="button" data-detail="${escapeHTML(p.id)}" aria-label="${escapeHTML(p.name)} বিস্তারিত দেখুন"><div class="product-thumb" style="background:${escapeHTML(p.bg||"#e5e7eb")}">${productArtwork(p)}</div></button><div class="product-info"><div class="product-meta"><span>${escapeHTML(p.category)}</span><span>ডিজিটাল ফাইল</span></div><button class="product-title-button" type="button" data-detail="${escapeHTML(p.id)}"><h3>${escapeHTML(p.name)}</h3></button><div class="product-bottom"><span class="price">${money(p.price)}</span><button class="add-button" data-add="${escapeHTML(p.id)}">+ কার্টে যোগ</button></div><button class="details-link" type="button" data-detail="${escapeHTML(p.id)}">বিস্তারিত দেখুন →</button></div></article>`).join("");
  appendPurchaseStatusCards(shown);
  const emptyState=document.getElementById("emptyState");emptyState.hidden=shown.length>0;emptyState.textContent=products.length?"এই নামে কোনো ডিজাইন পাওয়া যায়নি।":"এখনো কোনো ডিজাইন আপলোড করা হয়নি।";
}
function appendPurchaseStatusCards(shown){
  for(const product of shown){
    const purchase=purchaseStatusByProduct.get(String(product.id));if(!purchase)continue;
    const card=grid.querySelector('[data-product="'+CSS.escape(String(product.id))+'"] .product-info');if(!card)continue;
    const status=document.createElement('div');status.className='product-purchase-status '+(purchase.status==='paid'?'is-ready':'is-pending');
    if(purchase.status==='paid'&&purchase.downloads.length){const label=document.createElement('span');label.textContent='✓ পেমেন্ট সম্পন্ন';status.append(label);for(const file of purchase.downloads){const link=document.createElement('a');link.className='product-download-link';link.href=file.url;link.textContent='↓ ডাউনলোড';status.append(link);}}
    else status.textContent='◷ পেমেন্ট যাচাই অপেক্ষমাণ · Pending';
    card.append(status);
  }
}
function showProductDetails(id){
  const p=products.find(x=>String(x.id)===String(id)); if(!p)return;
  const detail=document.getElementById("productDetailContent");
  const artwork = productArtwork(p);
  detail.innerHTML=`<div class="detail-watermark" aria-hidden="true">${artwork}</div><div class="detail-art" style="background:${escapeHTML(p.bg||"#e5e7eb")}"><div class="detail-art-stage">${artwork}</div><span class="preview-chip">3D DESIGN PREVIEW</span></div><div class="detail-copy"><span class="eyebrow">PRODUCT DETAILS</span><div class="product-meta"><span>${escapeHTML(p.category)}</span><span>ডিজিটাল পণ্য</span></div><h2>${escapeHTML(p.name)}</h2><strong class="detail-price">${money(p.price)}</strong><p>${escapeHTML(p.description||"এই ডিজাইনটি ডিজিটাল ফাইল হিসেবে সরবরাহ করা হবে। অর্ডার ও পেমেন্ট যাচাই সম্পন্ন হলে ডাউনলোডের ব্যবস্থা করা হবে।")}</p><ul class="detail-specs"><li>পণ্য: ডিজিটাল ডিজাইন</li><li>ডেলিভারি: পেমেন্ট যাচাইয়ের পর</li><li>ফাইল ফরম্যাট: ${escapeHTML(p.fileType||"বিস্তারিত জানতে অর্ডারের আগে যোগাযোগ করুন")}</li></ul><div class="detail-actions"><button class="detail-cart-button" type="button" data-detail-add="${escapeHTML(p.id)}">+ কার্টে যোগ করুন</button><button class="detail-buy-button" type="button" data-detail-buy="${escapeHTML(p.id)}">এখনই কিনুন · ${money(p.price)}</button></div></div>`;
  document.getElementById("productDialog").showModal();
}
function addToCart(id){const p=products.find(x=>String(x.id)===String(id));if(!p)return;if(p.isSample){alert("এটি শুধু নমুনা ডিজাইন। কেনার জন্য Admin Panel থেকে আসল পণ্য আপলোড করতে হবে।");return;}const found=cart.find(x=>x.id===id);if(found)found.qty++;else cart.push({...p,qty:1});renderCart();}

function renderCart(){
  document.getElementById("cartCount").textContent=cart.reduce((a,b)=>a+b.qty,0);
  document.getElementById("cartItems").innerHTML=cart.length?cart.map(item=>`<div class="cart-line"><div><h4>${item.name}</h4><small>${item.qty} × ${money(item.price)}</small></div><div><b>${money(item.qty*item.price)}</b><br><button class="remove-item" data-remove="${item.id}">বাদ দিন</button></div></div>`).join(""):'<p class="cart-empty">আপনার কার্ট এখনো খালি।</p>';
  const total=cart.reduce((a,b)=>a+b.qty*b.price,0);
  document.getElementById("cartTotal").textContent=money(total);
  document.getElementById("dialogTotal").textContent=money(total);
  document.getElementById("checkoutButton").disabled=!cart.length;
}
function openCart(){document.getElementById("cartDrawer").classList.add("open");document.getElementById("backdrop").classList.add("show")}
function closeCart(){document.getElementById("cartDrawer").classList.remove("open");document.getElementById("backdrop").classList.remove("show")}
grid.addEventListener("click",e=>{
  const add=e.target.closest("[data-add]"); if(add){e.stopPropagation();addToCart(add.dataset.add);openCart();return;}
  const detail=e.target.closest("[data-detail]"); if(detail){showProductDetails(detail.dataset.detail);return;}
});
grid.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.classList.contains("product-card")){e.preventDefault();showProductDetails(e.target.dataset.product);}});
document.getElementById("productDetailContent").addEventListener("click",e=>{
  const add=e.target.closest("[data-detail-add]");
  if(add){addToCart(add.dataset.detailAdd);document.getElementById("productDialog").close();openCart();return;}
  const buy=e.target.closest("[data-detail-buy]");
  if(buy){buyNow(buy.dataset.detailBuy);}
});
function buyNow(id){
  const p=products.find(x=>String(x.id)===String(id));if(!p)return;
  if(p.isSample){alert("এটি শুধু নমুনা ডিজাইন। কেনার জন্য Admin Panel থেকে আসল পণ্য আপলোড করতে হবে।");return;}
  cart=[{...p,qty:1}];renderCart();
  document.getElementById("productDialog").close();
  closeCart();
  unlockCheckoutCustomerFields();
  document.getElementById("checkoutDialog").showModal();
  document.getElementById("checkoutMessage").textContent="";
}
function unlockCheckoutCustomerFields(){for(const id of ["buyerName","buyerEmail"]){const field=document.getElementById(id);if(!field)continue;field.disabled=false;field.readOnly=false;field.removeAttribute("disabled");field.removeAttribute("readonly");field.style.pointerEvents="auto";field.style.userSelect="text";}}
const checkoutDialog=document.getElementById("checkoutDialog");
checkoutDialog.addEventListener("show",unlockCheckoutCustomerFields);
checkoutDialog.addEventListener("click",event=>{if(event.target.matches("#buyerName,#buyerEmail"))unlockCheckoutCustomerFields();});
document.getElementById("closeProductDialog").onclick=()=>document.getElementById("productDialog").close();
document.getElementById("closeCheckout").onclick=()=>document.getElementById("checkoutDialog").close();
for(const dlg of [document.getElementById("checkoutDialog"),document.getElementById("productDialog")]) dlg.addEventListener("click",e=>{if(e.target===dlg)dlg.close();});
document.getElementById("cartItems").addEventListener("click",e=>{const id=e.target.dataset.remove;if(!id)return;cart=cart.filter(x=>String(x.id)!==String(id));renderCart()});
document.getElementById("openCart").onclick=openCart;document.getElementById("closeCart").onclick=closeCart;document.getElementById("backdrop").onclick=closeCart;
document.getElementById("checkoutButton").onclick=()=>{closeCart();unlockCheckoutCustomerFields();document.getElementById("checkoutDialog").showModal();document.getElementById("checkoutMessage").textContent=""};
document.getElementById("copyNagad").onclick=async()=>{try{await navigator.clipboard.writeText("01951608000");document.getElementById("checkoutMessage").textContent="Nagad নম্বর কপি হয়েছে।"}catch{document.getElementById("checkoutMessage").textContent="Nagad নম্বর: 01951608000"}};
document.getElementById("submitPayment").onclick=async()=>{
  const name=document.getElementById("buyerName"), email=document.getElementById("buyerEmail"), sender=document.getElementById("senderPhone"), trx=document.getElementById("trxId"), msg=document.getElementById("checkoutMessage"), btn=document.getElementById("submitPayment");
  if(!name.reportValidity()||!email.reportValidity()||!sender.reportValidity()||!trx.reportValidity())return;
  if(!cart.length){msg.textContent="আপনার কার্ট খালি।";return;}
  btn.disabled=true;msg.textContent="অর্ডার জমা হচ্ছে...";
  try{
    const response=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerName:name.value.trim(),email:email.value.trim(),phone:sender.value.trim(),trxId:trx.value.trim(),items:cart.map(x=>({id:x.id,qty:x.qty}))})});
    const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'অর্ডার জমা হয়নি।');
    const purchasedItems=cart.map(item=>({...item}));
    try{const saved=JSON.parse(localStorage.getItem(PURCHASE_STORAGE_KEY)||"[]");saved.unshift({orderId:String(data.orderId),email:email.value.trim()});localStorage.setItem(PURCHASE_STORAGE_KEY,JSON.stringify(saved.slice(0,30)));}catch{}
    await refreshPurchasedProductStatuses();
    const receiptTotal=Number(data.total)||purchasedItems.reduce((sum,item)=>sum+item.price*item.qty,0);
    document.getElementById("receiptContent").innerHTML=`
      <div class="receipt-brand"><span class="brand-mark">S</span><strong>Sajjad<span>hub</span></strong></div>
      <p class="receipt-kicker">SAJJADHUB · ORDER RECEIPT</p>
      <h2>ক্যাশ মেমো</h2>
      <p class="receipt-status">অর্ডার গ্রহণ করা হয়েছে · পেমেন্ট যাচাই বাকি</p>
      <div class="receipt-meta"><span>অর্ডার নম্বর</span><strong>#${escapeHTML(data.orderId)}</strong><span>তারিখ ও সময়</span><strong>${escapeHTML(new Date().toLocaleString("bn-BD"))}</strong></div>
      <hr>
      <h3>ক্রেতার তথ্য</h3>
      <p>${escapeHTML(name.value.trim())}<br>${escapeHTML(email.value.trim())}<br>${escapeHTML(sender.value.trim())}</p>
      <h3>পণ্যের বিবরণ</h3>
      <table class="receipt-table"><thead><tr><th>পণ্য</th><th>পরিমাণ</th><th>মূল্য</th></tr></thead><tbody>${purchasedItems.map(item=>`<tr><td>${escapeHTML(item.name)}</td><td>${item.qty}</td><td>${money(item.price*item.qty)}</td></tr>`).join("")}</tbody></table>
      <div class="receipt-total"><span>সর্বমোট</span><strong>${money(receiptTotal)}</strong></div>
      <div class="receipt-payment"><p>পেমেন্ট মাধ্যম: Nagad Send Money</p><p>TrxID: ${escapeHTML(trx.value.trim())}</p><p>পেমেন্ট স্ট্যাটাস: <strong>Pending (যাচাই অপেক্ষমাণ)</strong></p></div>
      <p class="receipt-note">এটি অর্ডার জমার রসিদ, পেমেন্ট সম্পন্ন হওয়ার প্রমাণ নয়। পেমেন্ট যাচাই হলে ওয়েবসাইটের “আমার অর্ডার / ডাউনলোড” অংশে অর্ডার নম্বর ও ইমেইল দিয়ে ডিজাইন ডাউনলোড করতে পারবেন।</p>
    `;
    cart=[];renderCart();document.getElementById("checkoutDialog").close();document.getElementById("receiptDialog").showModal();
  }catch(error){msg.textContent=error.message||'সার্ভারের সঙ্গে সংযোগ হয়নি। আবার চেষ্টা করুন।'}finally{btn.disabled=false}
};

// Customer order cards and secure, payment-gated downloads.
function renderMyOrderCard(order){
  const ready=order.status==="paid"&&(order.downloads||[]).length>0;
  const statusLabel=ready?"Download":order.status==="rejected"?"বাতিল":"Pending";
  const statusClass=order.status==="paid"?"paid":order.status==="rejected"?"rejected":"";
  const content=ready?(order.downloads||[]).map(file=>'<a class="my-order-download" href="'+escapeHTML(file.url)+'">↓ '+escapeHTML(file.name)+' ডাউনলোড করুন</a>').join(""):order.status==="rejected"?'<p class="my-order-pending">এই অর্ডারটি বাতিল করা হয়েছে। সহায়তার জন্য যোগাযোগ করুন।</p>':order.status==="paid"?'<p class="my-order-pending">পেমেন্ট সম্পন্ন, তবে ডাউনলোড ফাইল পাওয়া যায়নি। অনুগ্রহ করে যোগাযোগ করুন।</p>':'<p class="my-order-pending">পেমেন্ট যাচাই চলছে। যাচাই সম্পন্ন হলে এখানে Download দেখা যাবে।</p>';
  return '<div class="my-order-card"><div class="my-order-card-head"><div><span>অর্ডার নম্বর</span><strong>#'+escapeHTML(order.id)+'</strong></div><span class="my-order-status '+statusClass+'">'+statusLabel+'</span></div><p class="my-order-items">'+(order.items||[]).map(item=>escapeHTML(item.product_name)+' × '+escapeHTML(item.quantity)).join(" · ")+'</p><div class="my-order-total"><span>অর্ডারের মোট</span><strong>'+money(order.total)+'</strong></div><div class="my-order-downloads">'+content+'</div></div>';
}
async function loadSavedCustomerOrders(){
  const area=document.getElementById("mySavedOrders");if(!area)return;
  let saved=[];try{saved=JSON.parse(localStorage.getItem(PURCHASE_STORAGE_KEY)||"[]");}catch{}
  if(!saved.length){area.innerHTML='<p class="my-saved-orders-empty">এই ব্রাউজারে কোনো সংরক্ষিত অর্ডার নেই। অন্য ব্রাউজার বা ডিভাইস হলে নিচে অর্ডার নম্বর ও ইমেইল দিয়ে খুঁজুন।</p>';return;}
  area.innerHTML='<p class="my-order-loading">আপনার অর্ডারগুলো খোঁজা হচ্ছে...</p>';
  const cards=[];
  for(const entry of saved.slice(0,30)){
    if(!entry||!entry.orderId||!entry.email)continue;
    try{const response=await fetch("/api/my-orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId:entry.orderId,email:entry.email})});const data=await response.json();if(response.ok&&data.success)cards.push(renderMyOrderCard(data.order));}catch{}
  }
  area.innerHTML=cards.length?cards.join(""):'<p class="my-order-error">অর্ডার পাওয়া যায়নি। নিচে অর্ডার নম্বর ও ইমেইল দিয়ে আবার খুঁজুন।</p>';
}
document.querySelector('a[href="#my-orders"]')?.addEventListener("click",()=>{loadSavedCustomerOrders();});
document.getElementById("myOrderForm").addEventListener("submit",async(event)=>{
  event.preventDefault();
  const orderId=document.getElementById("lookupOrderId").value.trim(),email=document.getElementById("lookupOrderEmail").value.trim();
  const button=document.getElementById("lookupOrderButton"),result=document.getElementById("myOrderResult");
  button.disabled=true;result.innerHTML='<p class="my-order-loading">অর্ডার খোঁজা হচ্ছে...</p>';
  try{const response=await fetch("/api/my-orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId,email})});const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||"অর্ডার খুঁজে পাওয়া যায়নি।");result.innerHTML=renderMyOrderCard(data.order);}
  catch(error){result.innerHTML='<p class="my-order-error">'+escapeHTML(error.message||"সার্ভারের সঙ্গে সংযোগ হয়নি।")+'</p>';}
  finally{button.disabled=false;}
});
loadSavedCustomerOrders();

async function refreshPurchasedProductStatuses(){
  let saved=[];try{saved=JSON.parse(localStorage.getItem(PURCHASE_STORAGE_KEY)||'[]');}catch{}
  purchaseStatusByProduct.clear();
  for(const entry of saved.slice(0,30)){
    if(!entry||!entry.orderId||!entry.email)continue;
    try{const response=await fetch('/api/my-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:entry.orderId,email:entry.email})});const data=await response.json();if(!response.ok||!data.success)continue;
      const order=data.order;for(const item of order.items||[]){const productId=String(item.product_id);const files=(order.downloads||[]).filter(file=>String(file.productId)===productId);const prev=purchaseStatusByProduct.get(productId);if(order.status==='paid'&&files.length)purchaseStatusByProduct.set(productId,{status:'paid',downloads:files});else if(!prev)purchaseStatusByProduct.set(productId,{status:order.status,downloads:[]});}
    }catch{}
  }
  renderProducts();
}
refreshPurchasedProductStatuses();

search.addEventListener("input",renderProducts);filter.addEventListener("change",renderProducts);
document.querySelector(".category-menu-dropdown")?.addEventListener("click",e=>{const link=e.target.closest("[data-category-link]");if(!link)return;const category=link.dataset.categoryLink;filter.value=category;document.querySelectorAll(".category-pills button").forEach(b=>b.classList.toggle("active",b.dataset.category===category));renderProducts();document.querySelector(".category-menu")?.removeAttribute("open")});
document.getElementById("printReceipt").addEventListener("click",()=>window.print());
document.getElementById("closeReceipt").addEventListener("click",()=>document.getElementById("receiptDialog").close());
document.getElementById("categoryPills").addEventListener("click",e=>{const c=e.target.dataset.category;if(!c)return;filter.value=c;document.querySelectorAll(".category-pills button").forEach(b=>b.classList.toggle("active",b.dataset.category===c));renderProducts()});
filter.addEventListener("change",()=>document.querySelectorAll(".category-pills button").forEach(b=>b.classList.toggle("active",b.dataset.category===filter.value)));
document.getElementById("year").textContent=new Date().getFullYear();
renderProducts();renderCart();
(async()=>{try{const r=await fetch('/api/products');const d=await r.json();if(r.ok&&d.success){products=d.products;renderProducts();}}catch(e){console.warn('Products API unavailable; no sample products are shown.',e)}})();