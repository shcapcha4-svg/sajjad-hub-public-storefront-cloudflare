
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
    button.innerHTML=dark?'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>';button.title=dark?"লাইট মোড":"ডার্ক মোড";
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
function escapeHTML(value="") { return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
function productArtwork(p, extraClass="") {
  if (p.imageUrl) return `<img class="${extraClass}" src="${escapeHTML(p.imageUrl)}" alt="${escapeHTML(p.name)}" loading="lazy">`;
  return `<div class="sample-art ${extraClass}" style="background:${escapeHTML(p.bg||"#e5e7eb")};color:${escapeHTML(p.ink||"#344054")}"><small>${escapeHTML(p.tag||"SAJJADHUB")}</small><strong>${p.title||"DESIGN"}</strong><small>${escapeHTML(p.sub||"DIGITAL DESIGN")}</small></div>`;
}
function productTagsMarkup(value){return String(value||"").split(",").map(t=>t.trim()).filter(Boolean).map(t=>`<span class="product-tag-chip">#${escapeHTML(t)}</span>`).join("")}
function hasOffer(p){const offer=Number(p.offerPrice);return p.offerPrice!==null&&p.offerPrice!==""&&Number.isFinite(offer)&&offer>=0&&offer<Number(p.price)}
function effectiveProductPrice(p){return hasOffer(p)?Number(p.offerPrice):Number(p.price)}
function productPriceMarkup(p){const offer=effectiveProductPrice(p);return offer<Number(p.price)?'<span class="old-price">'+money(p.price)+'</span><strong class="offer-price">'+money(offer)+'</strong>':'<span class="price">'+money(p.price)+'</span>'}
function renderProducts(){
  const q=search.value.trim().toLowerCase(), c=filter.value, isOfferView=c==="অফার";
  const shown=products.filter(p=>(isOfferView?hasOffer(p):(c==="সব"||p.category===c))&&(p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q)||String(p.tag||"").toLowerCase().includes(q)));
  grid.innerHTML=shown.map(p=>`<article class="product-card" data-product="${escapeHTML(p.id)}" tabindex="0" role="button" aria-label="${escapeHTML(p.name)} বিস্তারিত দেখুন"><button class="product-open" type="button" data-detail="${escapeHTML(p.id)}" aria-label="${escapeHTML(p.name)} বিস্তারিত দেখুন"><div class="product-thumb" style="background:${escapeHTML(p.bg||"#e5e7eb")}">${productArtwork(p)}</div></button><div class="product-info"><div class="product-meta"><span>${escapeHTML(p.category)}</span>${hasOffer(p)?'<span class="offer-product-badge">বিশেষ অফার</span>':'<span>ডিজিটাল ফাইল</span>'}</div>${productTagsMarkup(p.tag)?`<div class="product-tag-list">${productTagsMarkup(p.tag)}</div>`:""}<button class="product-title-button" type="button" data-detail="${escapeHTML(p.id)}"><h3>${escapeHTML(p.name)}</h3></button><div class="product-bottom"><span class="product-prices">${productPriceMarkup(p)}</span><button class="add-button" data-add="${escapeHTML(p.id)}">+ কার্টে যোগ</button></div><button class="details-link" type="button" data-detail="${escapeHTML(p.id)}">বিস্তারিত দেখুন →</button></div></article>`).join("");
  const heading=document.getElementById("shopHeading");if(heading)heading.innerHTML=isOfferView?'বিশেষ <em>অফার</em>':'এক্সপ্লোর করুন <em>ডিজাইন</em>';
  const eyebrow=document.getElementById("shopEyebrow");if(eyebrow)eyebrow.textContent=isOfferView?'SPECIAL OFFERS':'THE COLLECTION';
  const emptyState=document.getElementById("emptyState");emptyState.hidden=shown.length>0;emptyState.textContent=isOfferView?"এখন কোনো অফার চলছে না।":products.length?"এই নামে কোনো ডিজাইন পাওয়া যায়নি।":"এখনো কোনো ডিজাইন আপলোড করা হয়নি।";
}
function showProductDetails(id){
  const p=products.find(x=>String(x.id)===String(id)); if(!p)return;
  const detail=document.getElementById("productDetailContent");
  const artwork = productArtwork(p);
  detail.innerHTML=`<div class="detail-watermark" aria-hidden="true">${artwork}</div><div class="detail-art" style="background:${escapeHTML(p.bg||"#e5e7eb")}"><div class="detail-art-stage">${artwork}</div><span class="preview-chip">3D DESIGN PREVIEW</span></div><div class="detail-copy"><span class="eyebrow">PRODUCT DETAILS</span><div class="product-meta"><span>${escapeHTML(p.category)}</span><span>ডিজিটাল পণ্য</span></div>${productTagsMarkup(p.tag)?`<div class="product-tag-list detail-product-tags">${productTagsMarkup(p.tag)}</div>`:""}<h2>${escapeHTML(p.name)}</h2><div class="detail-price product-prices">${productPriceMarkup(p)}</div><p>${escapeHTML(p.description||"এই ডিজাইনটি ডিজিটাল ফাইল হিসেবে সরবরাহ করা হবে। অর্ডার ও পেমেন্ট যাচাই সম্পন্ন হলে ডাউনলোডের ব্যবস্থা করা হবে।")}</p><ul class="detail-specs"><li>পণ্য: ডিজিটাল ডিজাইন</li><li>ডেলিভারি: পেমেন্ট যাচাইয়ের পর</li><li>ফাইল ফরম্যাট: ${escapeHTML(p.fileType||"বিস্তারিত জানতে অর্ডারের আগে যোগাযোগ করুন")}</li></ul><div class="detail-actions"><button class="detail-cart-button" type="button" data-detail-add="${escapeHTML(p.id)}">+ কার্টে যোগ করুন</button><button class="detail-buy-button" type="button" data-detail-buy="${escapeHTML(p.id)}">এখনই কিনুন · ${money(effectiveProductPrice(p))}</button></div></div>`;
  document.getElementById("productDialog").showModal();
}
function addToCart(id){const p=products.find(x=>String(x.id)===String(id));if(!p)return;if(p.isSample){alert("এটি শুধু নমুনা ডিজাইন। কেনার জন্য Admin Panel থেকে আসল পণ্য আপলোড করতে হবে।");return;}const found=cart.find(x=>x.id===id);if(found)found.qty++;else cart.push({...p,price:effectiveProductPrice(p),qty:1});renderCart();}

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
const myOrdersDialog=document.getElementById("myOrdersDialog");
document.getElementById("openMyOrders").addEventListener("click",()=>{document.getElementById("myOrderLookupMessage").textContent="";document.getElementById("myOrderLookupResult").innerHTML="";myOrdersDialog.showModal();});

const notificationsDialog=document.getElementById("notificationsDialog");
const notificationDefaults=[
 {id:"welcome-designs",title:"আপনার পছন্দের ডিজাইন খুঁজে নিন",message:"Sajjadhub-এর ডিজাইন কালেকশন ঘুরে দেখুন। পছন্দ হলে সহজেই অর্ডার করতে পারবেন।",type:"info",link_url:"/#shop"},
 {id:"welcome-offer",title:"নতুন ডিজাইনের জন্য চোখ রাখুন",message:"নতুন কালেকশন ও বিশেষ অফারের খবর পেতে এই নোটিফিকেশন সেন্টারটি নিয়মিত দেখুন।",type:"offer",link_url:"/#shop"}
];
function notificationSeen(){try{return JSON.parse(localStorage.getItem("sajjadhub-notifications-seen")||"[]")}catch{return[]}}
function markNotificationsSeen(items){try{const seen=new Set(notificationSeen());items.forEach(n=>seen.add(String(n.id)));localStorage.setItem("sajjadhub-notifications-seen",JSON.stringify([...seen].slice(-150)))}catch{}}
function renderNotifications(items){
 const list=document.getElementById("notificationList"),seen=notificationSeen();
 const ordered=[...items].sort((a,b)=>{const stamp=n=>{const value=String(n.created_at||"");const parsed=Date.parse(value.includes("T")?value:value.replace(" ","T")+"Z");return Number.isFinite(parsed)?parsed:0};return stamp(b)-stamp(a)});
 const labels={offer:"অফার",product:"নতুন ডিজাইন",order:"আপনার অর্ডার",info:"ঘোষণা"};
 const icons={offer:"％",product:"✦",order:"▣",info:"i"};
 list.innerHTML=ordered.map(n=>{const isNew=!seen.includes(String(n.id));const action=n.link_url?'<a class="notification-action" href="'+escapeHTML(n.link_url)+'">বিস্তারিত দেখুন ↗</a>':"";return '<article class="notification-card '+(isNew?"is-new":"")+'"><div class="notification-card-icon type-'+escapeHTML(n.type||"info")+'">'+(icons[n.type]||"i")+'</div><div class="notification-card-content"><div class="notification-card-meta"><span>'+(labels[n.type]||"ঘোষণা")+'</span>'+(isNew?'<b>নতুন</b>':"")+'</div><strong>'+escapeHTML(n.title)+'</strong><p>'+escapeHTML(n.message)+'</p>'+action+'<small>'+(n.created_at?escapeHTML(n.created_at):"Sajjadhub")+'</small></div></article>'}).join("")||'<div class="notification-empty">এখনো নতুন কোনো নোটিফিকেশন নেই। নতুন বার্তা এলে এখানে দেখাবে।</div>';
}
function getNotificationOrderContext(){try{return JSON.parse(sessionStorage.getItem("sajjadhub-notification-order")||"null")}catch{return null}}
async function fetchNotifications(){
 const message=document.getElementById("notificationMessage"),button=document.getElementById("loadNotifications"),list=document.getElementById("notificationList");
 button.disabled=true;message.textContent="আপডেট খোঁজা হচ্ছে...";list.innerHTML='<div class="notification-empty">লোড হচ্ছে...</div>';
 try{
  const context=getNotificationOrderContext(),params=new URLSearchParams();
  if(context?.email&&context?.orderId){params.set("email",context.email);params.set("orderId",context.orderId)}
  const url="/api/notifications"+(params.toString()?"?"+params.toString():"");
  const response=await fetch(url,{cache:"no-store"}),data=await response.json();
  if(!response.ok||!data.success)throw new Error(data.message||"নোটিফিকেশন লোড হয়নি।");
  const items=[...(data.notifications||[]),...notificationDefaults];
  renderNotifications(items);markNotificationsSeen(items);
  document.getElementById("notificationUnread").hidden=true;
  message.textContent=context?.email?"সাধারণ বার্তার সঙ্গে আপনার যাচাই করা অর্ডারের আপডেটও দেখানো হয়েছে।":"অর্ডারের ব্যক্তিগত আপডেট পেতে আগে “আমার অর্ডার” থেকে রসিদ ও ইমেইল যাচাই করুন।";
 }catch(error){list.innerHTML='<div class="notification-empty">এখন আপডেট আনা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।</div>';message.textContent=error.message}
 finally{button.disabled=false}
}
document.getElementById("openNotifications").addEventListener("click",()=>{notificationsDialog.showModal();fetchNotifications()});
document.getElementById("closeNotifications").addEventListener("click",()=>notificationsDialog.close());
notificationsDialog.addEventListener("click",e=>{if(e.target===notificationsDialog)notificationsDialog.close()});
document.getElementById("loadNotifications").addEventListener("click",fetchNotifications);
async function updateNotificationBadge(){try{const context=getNotificationOrderContext(),params=new URLSearchParams();if(context?.email&&context?.orderId){params.set("email",context.email);params.set("orderId",context.orderId)}const response=await fetch("/api/notifications"+(params.toString()?"?"+params.toString():""),{cache:"no-store"}),data=await response.json();if(!response.ok||!data.success)return;const all=[...notificationDefaults,...(data.notifications||[])],seen=notificationSeen();document.getElementById("notificationUnread").hidden=!all.some(n=>!seen.includes(String(n.id)))}catch{}}
updateNotificationBadge();
window.addEventListener("focus",updateNotificationBadge);
setInterval(()=>{updateNotificationBadge();if(notificationsDialog.open)fetchNotifications()},20000);

document.getElementById("closeMyOrders").addEventListener("click",()=>myOrdersDialog.close());
myOrdersDialog.addEventListener("click",event=>{if(event.target===myOrdersDialog)myOrdersDialog.close();});
document.getElementById("lookupMyOrder").addEventListener("click",async()=>{
 const orderId=document.getElementById("myOrderId"),email=document.getElementById("myOrderEmail"),message=document.getElementById("myOrderLookupMessage"),result=document.getElementById("myOrderLookupResult"),button=document.getElementById("lookupMyOrder");
 if(!orderId.reportValidity()||!email.reportValidity())return;
 button.disabled=true;message.textContent="অর্ডার খোঁজা হচ্ছে...";result.innerHTML="";
 try{
  const response=await fetch("/api/my-orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId:orderId.value.trim(),email:email.value.trim()})});
  const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||"অর্ডার পাওয়া যায়নি।");
  const order=data.order;try{sessionStorage.setItem("sajjadhub-notification-order",JSON.stringify({orderId:String(order.id),email:email.value.trim()}));}catch{}updateNotificationBadge();const items=(order.items||[]).map(item=>`<li>${escapeHTML(item.product_name)} × ${Number(item.quantity)||1}</li>`).join("");
  let statusText="আপনার অর্ডারটি পেন্ডিং আছে। পেমেন্ট যাচাই চলছে।";let downloads="";
  if(order.status==="paid"){statusText="আপনার ডিজাইন অনুমোদিত হয়েছে। রশিদ নম্বর ও এই ইমেইল দিয়ে অর্ডার খুঁজে এখন ডিজাইন ডাউনলোড করতে পারবেন।";downloads=(order.downloads||[]).map(file=>`<a class="my-order-download" href="${escapeHTML(file.url)}">${escapeHTML(file.name)} — ডাউনলোড</a>`).join("")||"<p>ডাউনলোড ফাইল এখনো যুক্ত করা হয়নি।</p>";}
  else if(order.status==="rejected")statusText="দুঃখিত, আপনার পেমেন্ট অনুমোদিত হয়নি। সহায়তার জন্য যোগাযোগ করুন।";
  result.innerHTML=`<section class="my-order-result-card"><strong>অর্ডার #${escapeHTML(order.id)}</strong><p>${statusText}</p><ul>${items}</ul><div class="my-order-result-total">মোট: ${money(order.total)}</div>${downloads}</section>`;
  message.textContent="";
 }catch(error){message.textContent=error.message||"সার্ভারের সঙ্গে সংযোগ হয়নি। আবার চেষ্টা করুন।";}
 finally{button.disabled=false;}
});
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
    try{sessionStorage.setItem("sajjadhub-notification-order",JSON.stringify({orderId:String(data.orderId),email:email.value.trim()}));}catch{}updateNotificationBadge();
    const purchasedItems=cart.map(item=>({...item}));
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
      <div class="receipt-payment"><p>পেমেন্ট মাধ্যম: Nagad Send Money</p><p>TrxID: ${escapeHTML(trx.value.trim())}</p></div>
      <p class="receipt-note">এটি আপনার অর্ডার জমার রসিদ। ভবিষ্যৎ প্রয়োজনে অর্ডার নম্বর, এই রসিদ এবং দেওয়া ইমেইলটি সংরক্ষণ করুন।</p>
    `;
    cart=[];renderCart();document.getElementById("checkoutDialog").close();document.getElementById("receiptDialog").showModal();
  }catch(error){msg.textContent=error.message||'সার্ভারের সঙ্গে সংযোগ হয়নি। আবার চেষ্টা করুন।'}finally{btn.disabled=false}
};

search.addEventListener("input",renderProducts);filter.addEventListener("change",renderProducts);
document.querySelector(".category-menu-dropdown")?.addEventListener("click",e=>{const link=e.target.closest("[data-category-link]");if(!link)return;const category=link.dataset.categoryLink;filter.value=category;document.querySelectorAll(".category-pills button").forEach(b=>b.classList.toggle("active",b.dataset.category===category));renderProducts();document.querySelector(".category-menu")?.removeAttribute("open")});
document.getElementById("printReceipt").addEventListener("click",()=>window.print());
document.getElementById("closeReceipt").addEventListener("click",()=>document.getElementById("receiptDialog").close());
document.getElementById("categoryPills").addEventListener("click",e=>{const b=e.target.closest("button[data-category]");if(!b)return;const c=b.dataset.category;filter.value=c;document.querySelectorAll(".category-pills button").forEach(x=>x.classList.toggle("active",x===b));renderProducts()});
document.querySelector("[data-offers-link]")?.addEventListener("click",()=>document.querySelector('#categoryPills [data-category="অফার"]')?.click());
filter.addEventListener("change",()=>document.querySelectorAll(".category-pills button").forEach(b=>b.classList.toggle("active",b.dataset.category===filter.value)));
document.getElementById("year").textContent=new Date().getFullYear();
renderProducts();renderCart();
(async()=>{try{const r=await fetch('/api/products');const d=await r.json();if(r.ok&&d.success){products=d.products;renderProducts();const requestedProduct=new URLSearchParams(location.search).get("product");if(requestedProduct){const selected=products.find(p=>String(p.id)===String(requestedProduct));if(selected){showProductDetails(selected.id);document.getElementById("productDetailContent").insertAdjacentHTML("beforeend",'<p class="product-seo-link"><a href="/product/'+encodeURIComponent(selected.id)+'">এই ডিজাইনের শেয়ারযোগ্য পেজ দেখুন ↗</a></p>');}}}}catch(e){console.warn('Products API unavailable; no sample products are shown.',e)}})();
// Product SEO deep links are initialized after the live product catalog loads.
