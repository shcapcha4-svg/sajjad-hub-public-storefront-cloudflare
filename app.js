
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
function escapeHTML(value="") { return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
function productArtwork(p, extraClass="") {
  if (p.imageUrl) return `<img class="${extraClass}" src="${escapeHTML(p.imageUrl)}" alt="${escapeHTML(p.name)}" loading="lazy">`;
  return `<div class="sample-art ${extraClass}" style="background:${escapeHTML(p.bg||"#e5e7eb")};color:${escapeHTML(p.ink||"#344054")}"><small>${escapeHTML(p.tag||"SAJJADHUB")}</small><strong>${p.title||"DESIGN"}</strong><small>${escapeHTML(p.sub||"DIGITAL DESIGN")}</small></div>`;
}
function renderProducts(){
  const q=search.value.trim().toLowerCase(), c=filter.value;
  const shown=products.filter(p=>(c==="সব"||p.category===c)&&(p.name.toLowerCase().includes(q)||p.category.toLowerCase().includes(q)));
  grid.innerHTML=shown.map(p=>`<article class="product-card" data-product="${escapeHTML(p.id)}" tabindex="0" role="button" aria-label="${escapeHTML(p.name)} বিস্তারিত দেখুন"><button class="product-open" type="button" data-detail="${escapeHTML(p.id)}" aria-label="${escapeHTML(p.name)} বিস্তারিত দেখুন"><div class="product-thumb" style="background:${escapeHTML(p.bg||"#e5e7eb")}">${productArtwork(p)}</div></button><div class="product-info"><div class="product-meta"><span>${escapeHTML(p.category)}</span><span>ডিজিটাল ফাইল</span></div><button class="product-title-button" type="button" data-detail="${escapeHTML(p.id)}"><h3>${escapeHTML(p.name)}</h3></button><div class="product-bottom"><span class="price">${money(p.price)}</span><button class="add-button" data-add="${escapeHTML(p.id)}">+ কার্টে যোগ</button></div><button class="details-link" type="button" data-detail="${escapeHTML(p.id)}">বিস্তারিত দেখুন →</button></div></article>`).join("");
  document.getElementById("emptyState").hidden=shown.length>0;
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
  document.getElementById("checkoutDialog").showModal();
  document.getElementById("checkoutMessage").textContent="";
}
document.getElementById("closeProductDialog").onclick=()=>document.getElementById("productDialog").close();
document.getElementById("closeCheckout").onclick=()=>document.getElementById("checkoutDialog").close();
for(const dlg of [document.getElementById("checkoutDialog"),document.getElementById("productDialog")]) dlg.addEventListener("click",e=>{if(e.target===dlg)dlg.close();});
document.getElementById("cartItems").addEventListener("click",e=>{const id=e.target.dataset.remove;if(!id)return;cart=cart.filter(x=>String(x.id)!==String(id));renderCart()});
document.getElementById("openCart").onclick=openCart;document.getElementById("closeCart").onclick=closeCart;document.getElementById("backdrop").onclick=closeCart;
document.getElementById("checkoutButton").onclick=()=>{closeCart();document.getElementById("checkoutDialog").showModal();document.getElementById("checkoutMessage").textContent=""};
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
      <p class="receipt-note">এটি অর্ডার জমার রসিদ, পেমেন্ট সম্পন্ন হওয়ার প্রমাণ নয়। পেমেন্ট যাচাই হলে ডাউনলোডের ব্যবস্থা করা হবে।</p>
    `;
    cart=[];renderCart();document.getElementById("checkoutDialog").close();document.getElementById("receiptDialog").showModal();
  }catch(error){msg.textContent=error.message||'সার্ভারের সঙ্গে সংযোগ হয়নি। আবার চেষ্টা করুন।'}finally{btn.disabled=false}
};

search.addEventListener("input",renderProducts);filter.addEventListener("change",renderProducts);
document.querySelector("[data-category-link]")?.addEventListener("click",()=>{filter.value="ক্যাশ মেমো";document.querySelectorAll(".category-pills button").forEach(b=>b.classList.toggle("active",b.dataset.category==="ক্যাশ মেমো"));renderProducts()});
document.getElementById("printReceipt").addEventListener("click",()=>window.print());
document.getElementById("closeReceipt").addEventListener("click",()=>document.getElementById("receiptDialog").close());
document.getElementById("categoryPills").addEventListener("click",e=>{const c=e.target.dataset.category;if(!c)return;filter.value=c;document.querySelectorAll(".category-pills button").forEach(b=>b.classList.toggle("active",b.dataset.category===c));renderProducts()});
filter.addEventListener("change",()=>document.querySelectorAll(".category-pills button").forEach(b=>b.classList.toggle("active",b.dataset.category===filter.value)));
document.getElementById("year").textContent=new Date().getFullYear();
renderProducts();renderCart();
(async()=>{try{const r=await fetch('/api/products');const d=await r.json();if(r.ok&&d.success){products=d.products;renderProducts();}}catch(e){console.warn('Products API unavailable; no sample products are shown.',e)}})();