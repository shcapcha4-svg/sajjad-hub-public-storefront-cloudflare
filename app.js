const defaultProducts = [
  {id:"p1",name:"মডার্ন বিজনেস পোস্টার",category:"পোস্টার",price:150,tag:"BEST SELLER",bg:"#d9e7c4",ink:"#243b20",title:"GROW<br>YOUR<br>IDEA",sub:"BUSINESS / 2026"},
  {id:"p2",name:"ইসলামিক ইভেন্ট ব্যানার",category:"ব্যানার",price:200,tag:"NEW",bg:"#173c35",ink:"#f3e7c2",title:"نور<br>الإيمان",sub:"SPECIAL EVENT"},
  {id:"p3",name:"সোশ্যাল মিডিয়া প্যাক",category:"সোশ্যাল মিডিয়া",price:120,tag:"POPULAR",bg:"#f1d4c8",ink:"#913f35",title:"MAKE<br>IT<br>MATTER",sub:"SOCIAL TEMPLATE"},
  {id:"p4",name:"মিনিমাল লোগো টেমপ্লেট",category:"লোগো",price:180,tag:"EDITABLE",bg:"#dce4f6",ink:"#263c6c",title:"S / H",sub:"BRAND IDENTITY"},
  {id:"p5",name:"শিক্ষা প্রতিষ্ঠানের পোস্টার",category:"পোস্টার",price:160,tag:"FRESH",bg:"#f5e7b9",ink:"#56451b",title:"LEARN<br>& GROW",sub:"EDUCATION SERIES"},
  {id:"p6",name:"প্রমোশনাল ব্যানার",category:"ব্যানার",price:220,tag:"FEATURED",bg:"#d9d3ef",ink:"#46336c",title:"BIG<br>OFFER",sub:"PROMOTION DESIGN"},
  {id:"p7",name:"ইনস্টাগ্রাম পোস্ট সেট",category:"সোশ্যাল মিডিয়া",price:130,tag:"5 TEMPLATES",bg:"#d4e9e8",ink:"#1b5554",title:"STAY<br>INSPIRED",sub:"SOCIAL MEDIA KIT"},
  {id:"p8",name:"ক্রিয়েটিভ মনোগ্রাম",category:"লোগো",price:190,tag:"CLASSIC",bg:"#e6d6c7",ink:"#634a35",title:"SH",sub:"MONOGRAM SERIES"}
];
// Public storefront: products are defined in this file; no browser-local admin data is loaded.
let products = defaultProducts;
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
  const p=products.find(x=>x.id===id); if(!p)return;
  const detail=document.getElementById("productDetailContent");
  const artwork = productArtwork(p);
  detail.innerHTML=`<div class="detail-watermark" aria-hidden="true">${artwork}</div><div class="detail-art" style="background:${escapeHTML(p.bg||"#e5e7eb")}"><div class="detail-art-stage">${artwork}</div><span class="preview-chip">3D DESIGN PREVIEW</span></div><div class="detail-copy"><span class="eyebrow">PRODUCT DETAILS</span><div class="product-meta"><span>${escapeHTML(p.category)}</span><span>ডিজিটাল পণ্য</span></div><h2>${escapeHTML(p.name)}</h2><strong class="detail-price">${money(p.price)}</strong><p>${escapeHTML(p.description||"এই ডিজাইনটি ডিজিটাল ফাইল হিসেবে সরবরাহ করা হবে। অর্ডার ও পেমেন্ট যাচাই সম্পন্ন হলে ডাউনলোডের ব্যবস্থা করা হবে।")}</p><ul class="detail-specs"><li>পণ্য: ডিজিটাল ডিজাইন</li><li>ডেলিভারি: পেমেন্ট যাচাইয়ের পর</li><li>ফাইল ফরম্যাট: ${escapeHTML(p.fileType||"বিস্তারিত জানতে অর্ডারের আগে যোগাযোগ করুন")}</li></ul><div class="detail-actions"><button class="detail-cart-button" type="button" data-detail-add="${escapeHTML(p.id)}">+ কার্টে যোগ করুন</button><button class="detail-buy-button" type="button" data-detail-buy="${escapeHTML(p.id)}">এখনই কিনুন · ${money(p.price)}</button></div></div>`;
  document.getElementById("productDialog").showModal();
}
function addToCart(id){const p=products.find(x=>x.id===id);if(!p)return;const found=cart.find(x=>x.id===id);if(found)found.qty++;else cart.push({...p,qty:1});renderCart();}

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
  const p=products.find(x=>x.id===id);if(!p)return;
  cart=[{...p,qty:1}];renderCart();
  document.getElementById("productDialog").close();
  closeCart();
  document.getElementById("checkoutDialog").showModal();
  document.getElementById("checkoutMessage").textContent="";
}
document.getElementById("closeProductDialog").onclick=()=>document.getElementById("productDialog").close();
document.getElementById("closeCheckout").onclick=()=>document.getElementById("checkoutDialog").close();
for(const dlg of [document.getElementById("checkoutDialog"),document.getElementById("productDialog")]) dlg.addEventListener("click",e=>{if(e.target===dlg)dlg.close();});
document.getElementById("cartItems").addEventListener("click",e=>{const id=e.target.dataset.remove;if(!id)return;cart=cart.filter(x=>x.id!==id);renderCart()});
document.getElementById("openCart").onclick=openCart;document.getElementById("closeCart").onclick=closeCart;document.getElementById("backdrop").onclick=closeCart;
document.getElementById("checkoutButton").onclick=()=>{closeCart();document.getElementById("checkoutDialog").showModal();document.getElementById("checkoutMessage").textContent=""};
document.getElementById("copyNagad").onclick=async()=>{try{await navigator.clipboard.writeText("01951608000");document.getElementById("checkoutMessage").textContent="Nagad নম্বর কপি হয়েছে।"}catch{document.getElementById("checkoutMessage").textContent="Nagad নম্বর: 01951608000"}};
document.getElementById("submitPayment").onclick=async()=>{
  const email=document.getElementById("buyerEmail"), sender=document.getElementById("senderPhone"), trx=document.getElementById("trxId"), msg=document.getElementById("checkoutMessage"), btn=document.getElementById("submitPayment");
  if(!email.reportValidity()||!sender.reportValidity()||!trx.reportValidity())return;
  if(!cart.length){msg.textContent="আপনার কার্ট খালি।";return;}
  btn.disabled=true;msg.textContent="অর্ডার জমা হচ্ছে...";
  try{
    const response=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value.trim(),phone:sender.value.trim(),trxId:trx.value.trim(),items:cart.map(x=>({id:x.id,qty:x.qty}))})});
    const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'অর্ডার জমা হয়নি।');
    msg.textContent=`অর্ডার ${data.orderId} সফলভাবে জমা হয়েছে। পেমেন্ট যাচাই শেষে ডাউনলোডের ব্যবস্থা করা হবে।`;cart=[];renderCart();
  }catch(error){msg.textContent=error.message||'সার্ভারের সঙ্গে সংযোগ হয়নি। আবার চেষ্টা করুন।'}finally{btn.disabled=false}
};

search.addEventListener("input",renderProducts);filter.addEventListener("change",renderProducts);
document.getElementById("categoryPills").addEventListener("click",e=>{const c=e.target.dataset.category;if(!c)return;filter.value=c;document.querySelectorAll(".category-pills button").forEach(b=>b.classList.toggle("active",b.dataset.category===c));renderProducts()});
filter.addEventListener("change",()=>document.querySelectorAll(".category-pills button").forEach(b=>b.classList.toggle("active",b.dataset.category===filter.value)));
document.getElementById("year").textContent=new Date().getFullYear();
renderProducts();renderCart();
(async()=>{try{const r=await fetch('/api/products');const d=await r.json();if(r.ok&&d.success){products=d.products;renderProducts();}}catch(e){console.warn('Products API unavailable; showing sample products.',e)}})();