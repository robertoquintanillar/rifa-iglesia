import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// ⚙️  CONFIGURACIÓN — Edita estos valores antes de publicar
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  totalNumeros: 2000,
  precioPorNumero: 2000,
  premio: "Auto Chevrolet Spark 2026",
  fechaSorteo: "20 de Diciembre, 2026",
  maxPorPersona: 50,
  nombreIglesia: "Iglesia Vida Nueva",

  banco: "Banco Estado",
  tipoCuenta: "Cuenta Corriente",
  numeroCuenta: "12345678",
  nombreCuenta: "Iglesia Evangelica Vida Nueva",
  rutCuenta: "70.123.456-7",

  whatsappAdmin: "56912345678",
  emailAdmin: "admin@iglesiavidanueva.cl",
  adminPassword: "iglesia2026",

  // ─── SUPABASE ─────────────────────────────────────────────────────────────
  supabaseUrl: "https://TU_PROYECTO.supabase.co",
  supabaseKey: "TU_ANON_KEY",

  // ─── RESEND (correos — 3.000/mes gratis) ──────────────────────────────────
  // 1. Ve a https://resend.com → crea cuenta
  // 2. Settings → API Keys → Create API Key
  // 3. Domains → Add Domain (o usa el dominio de prueba @resend.dev)
  resendApiKey: "re_TU_API_KEY",
  resendFromEmail: "rifa@iglesiavidanueva.cl",
};
// ─────────────────────────────────────────────────────────────────────────────

const gold = "#c9a84c";
const navy = "#0d1b3e";
const cream = "#faf7f0";
const emerald = "#1a7a4a";
const rose = "#c0392b";

const formatCLP = (n) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
const pad = (n, len = 4) => String(n).padStart(len, "0");
const isDemo = CONFIG.supabaseUrl.includes("TU_PROYECTO");

// ─── Demo state ───────────────────────────────────────────────────────────────
const DEMO_TAKEN = new Set([
  1,5,12,23,34,45,67,89,100,123,200,250,333,400,500,555,600,700,800,900,
  1000,1100,1200,1300,1400,1500,1600,1700,1800,1900,1999,2000,
  150,160,170,180,190,210,220,230,240,260,270,280,290,
]);
let demoPedidos = [
  { id:"d1", nombre:"María González", rut:"12.345.678-9", email:"maria@ejemplo.cl", telefono:"+56 9 8765 4321", numeros:[1,5,12], total:6000, estado:"confirmado", created_at: new Date(Date.now()-86400000).toISOString(), voucher_url:null },
  { id:"d2", nombre:"Pedro Soto", rut:"9.876.543-2", email:"pedro@ejemplo.cl", telefono:"+56 9 1234 5678", numeros:[23,34,45,67], total:8000, estado:"pendiente", created_at: new Date(Date.now()-3600000).toISOString(), voucher_url:null },
  { id:"d3", nombre:"Ana Muñoz", rut:"15.432.109-8", email:"ana@ejemplo.cl", telefono:"+56 9 5555 1234", numeros:[89,100,123,200,250], total:10000, estado:"rechazado", created_at: new Date(Date.now()-7200000).toISOString(), voucher_url:null },
];

// ─── Supabase client ──────────────────────────────────────────────────────────
function db() {
  const url = CONFIG.supabaseUrl;
  const key = CONFIG.supabaseKey;
  const h = { "Content-Type":"application/json", apikey:key, Authorization:`Bearer ${key}` };
  return {
    async getNumerosTomados() {
      const r = await fetch(`${url}/rest/v1/numeros_vendidos?select=numero`, { headers:h });
      const d = await r.json();
      return new Set((d||[]).map(x=>x.numero));
    },
    async getPedidos() {
      const r = await fetch(`${url}/rest/v1/pedidos?select=*&order=created_at.desc`, { headers:h });
      return r.json();
    },
    async insertPedido(p) {
      const r = await fetch(`${url}/rest/v1/pedidos`, {
        method:"POST", headers:{...h, Prefer:"return=representation"}, body:JSON.stringify(p)
      });
      return (await r.json())[0];
    },
    async marcarNumeros(nums) {
      await fetch(`${url}/rest/v1/numeros_vendidos`, {
        method:"POST", headers:{...h, Prefer:"resolution=ignore-duplicates"},
        body: JSON.stringify(nums.map(n=>({numero:n})))
      });
    },
    async updateEstado(id, estado) {
      await fetch(`${url}/rest/v1/pedidos?id=eq.${id}`, {
        method:"PATCH", headers:h, body:JSON.stringify({estado})
      });
    },
    async uploadVoucher(file, id) {
      const ext = file.name.split(".").pop();
      const path = `${id}.${ext}`;
      const r = await fetch(`${url}/storage/v1/object/comprobantes/${path}`, {
        method:"POST",
        headers:{ apikey:key, Authorization:`Bearer ${key}`, "Content-Type":file.type },
        body:file
      });
      if(!r.ok) throw new Error("Error subiendo comprobante");
      return `${url}/storage/v1/object/public/comprobantes/${path}`;
    }
  };
}

// ─── Resend email ─────────────────────────────────────────────────────────────
async function sendEmail({ nombre, email, numeros, total }) {
  try {
    const numsStr = numeros.map(n=>pad(n)).join(", ");
    const html = `
<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;background:#faf7f0;border-radius:16px;overflow:hidden;border:1px solid #e0d5c0;">
  <div style="background:#0d1b3e;padding:28px;text-align:center;">
    <div style="font-size:36px;color:#c9a84c;">✝</div>
    <h2 style="color:#fff;margin:8px 0 0;font-size:20px;">${CONFIG.nombreIglesia}</h2>
    <p style="color:rgba(255,255,255,0.55);margin:4px 0 0;font-size:12px;letter-spacing:2px;">RIFA BENÉFICA 2026</p>
  </div>
  <div style="padding:28px;">
    <h3 style="color:#0d1b3e;margin:0 0 12px;">¡Hola, ${nombre.split(" ")[0]}! 🎉</h3>
    <p style="color:#555;line-height:1.7;">Recibimos tu participación en la rifa. Verificaremos tu transferencia y te confirmaremos en las próximas 24 horas.</p>
    <div style="background:#fff;border-radius:12px;padding:20px;margin:20px 0;border:1px solid #e0d5c0;">
      <div style="margin-bottom:10px;font-size:14px;"><strong>🔢 Tus números:</strong><br><span style="color:#c9a84c;font-family:monospace;font-size:13px;">${numsStr}</span></div>
      <div style="margin-bottom:10px;font-size:14px;"><strong>💰 Total:</strong> ${formatCLP(total)}</div>
      <div style="margin-bottom:10px;font-size:14px;"><strong>🎁 Premio:</strong> ${CONFIG.premio}</div>
      <div style="font-size:14px;"><strong>📅 Sorteo:</strong> ${CONFIG.fechaSorteo}</div>
    </div>
    <p style="color:#e67e22;font-size:13px;background:#fff8e1;padding:12px;border-radius:8px;">⏳ <strong>Estado actual:</strong> Pendiente de verificación de pago</p>
    <hr style="border:1px solid #e0d5c0;margin:24px 0;">
    <p style="color:#bbb;font-size:11px;text-align:center;">${CONFIG.nombreIglesia} · Dios te bendiga 🙏</p>
  </div>
</div>`;
    await fetch("https://api.resend.com/emails", {
      method:"POST",
      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${CONFIG.resendApiKey}` },
      body:JSON.stringify({
        from: `${CONFIG.nombreIglesia} <${CONFIG.resendFromEmail}>`,
        to: [email],
        subject: `✝️ Participación recibida — Rifa ${CONFIG.nombreIglesia}`,
        html
      })
    });
  } catch(e) { console.warn("Email error:", e); }
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
function notifyWhatsApp({ nombre, email, numeros, total }) {
  const msg = encodeURIComponent(
    `🎟️ *Nueva venta — ${CONFIG.nombreIglesia}*\n\n` +
    `👤 *Nombre:* ${nombre}\n` +
    `📧 *Email:* ${email}\n` +
    `🔢 *Números (${numeros.length}):* ${numeros.map(pad).join(", ")}\n` +
    `💰 *Total:* ${formatCLP(total)}\n\n` +
    `⏳ Verificar comprobante en el panel admin.`
  );
  window.open(`https://wa.me/${CONFIG.whatsappAdmin}?text=${msg}`, "_blank");
}

// ─── Componente raíz ──────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("rifa");
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [pass, setPass] = useState("");
  const [passErr, setPassErr] = useState(false);

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        button{transition:all .15s;}
        button:hover:not(:disabled){filter:brightness(1.1);}
        input:focus,select:focus{outline:none;border-color:${gold}!important;box-shadow:0 0 0 3px ${gold}22;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes pop{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}
        .fade{animation:fadeUp .35s ease both}
        .pop{animation:pop .25s ease}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:${gold}44;border-radius:4px}
      `}</style>

      <nav style={S.nav}>
        <div style={S.navIn}>
          <div style={S.brand} onClick={()=>setView("rifa")}>
            <span style={S.cross}>✝</span>
            <div>
              <div style={S.brandName}>{CONFIG.nombreIglesia}</div>
              <div style={S.brandSub}>Rifa Benéfica · {CONFIG.fechaSorteo.split(",")[1]?.trim() ?? "2026"}</div>
            </div>
          </div>
          <button style={S.navBtn} onClick={()=>setView(view==="rifa"?"admin":"rifa")}>
            {view==="rifa" ? "⚙️ Admin" : "← Volver"}
          </button>
        </div>
      </nav>

      {isDemo && (
        <div style={S.demoBanner}>
          🔧 <strong>Modo Demo</strong> — Configura Supabase y Resend para producción
        </div>
      )}

      {view==="rifa" && <RifaView />}

      {view==="admin" && !adminAuthed && (
        <div style={S.loginWrap} className="fade">
          <div style={S.loginCard}>
            <div style={{fontSize:52,textAlign:"center"}}>🔐</div>
            <h2 style={S.loginTitle}>Panel Admin</h2>
            <input type="password" placeholder="Contraseña" value={pass}
              onChange={e=>{setPass(e.target.value);setPassErr(false)}}
              onKeyDown={e=>e.key==="Enter"&&(pass===CONFIG.adminPassword?setAdminAuthed(true):setPassErr(true))}
              style={{...S.input,...(passErr?{borderColor:rose}:{})}}
            />
            {passErr && <p style={{color:rose,fontSize:13,textAlign:"center"}}>Contraseña incorrecta</p>}
            <button style={{...S.btnPrimary,width:"100%"}}
              onClick={()=>pass===CONFIG.adminPassword?setAdminAuthed(true):setPassErr(true)}>
              Ingresar
            </button>
          </div>
        </div>
      )}
      {view==="admin" && adminAuthed && <AdminView />}
    </div>
  );
}

// ─── Vista Rifa ───────────────────────────────────────────────────────────────
function RifaView() {
  const [tomados, setTomados] = useState(isDemo ? DEMO_TAKEN : new Set());
  const [selected, setSelected] = useState(new Set());
  const [step, setStep] = useState("select");
  const [form, setForm] = useState({nombre:"",rut:"",email:"",telefono:""});
  const [voucher, setVoucher] = useState(null);
  const [voucherPreview, setVoucherPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState(null);
  const [confirmed, setConfirmed] = useState(null);

  useEffect(()=>{
    if(!isDemo) db().getNumerosTomados().then(setTomados).catch(()=>{});
  },[]);

  const toggle = useCallback(n=>{
    if(tomados.has(n)) return;
    setSelected(prev=>{
      const nx=new Set(prev);
      if(nx.has(n)) nx.delete(n);
      else if(nx.size<CONFIG.maxPorPersona) nx.add(n);
      return nx;
    });
  },[tomados]);

  const total = selected.size * CONFIG.precioPorNumero;

  const handleSubmit = async ()=>{
    const e={};
    if(!form.nombre.trim()) e.nombre="Requerido";
    if(!form.rut.trim()) e.rut="Requerido";
    if(!form.email.includes("@")) e.email="Email inválido";
    if(!form.telefono.trim()) e.telefono="Requerido";
    if(!voucher) e.voucher="Debes subir el comprobante";
    if(Object.keys(e).length){setErrors(e);return;}
    setSubmitting(true); setSubmitErr(null);
    const nums=[...selected].sort((a,b)=>a-b);
    try {
      let pedido;
      if(isDemo){
        await new Promise(r=>setTimeout(r,1600));
        pedido={id:`d${Date.now()}`,...form,numeros:nums,total,estado:"pendiente",created_at:new Date().toISOString(),voucher_url:null};
        demoPedidos.unshift(pedido);
        nums.forEach(n=>DEMO_TAKEN.add(n));
        setTomados(new Set(DEMO_TAKEN));
      } else {
        pedido = await db().insertPedido({...form,numeros:nums,total,estado:"pendiente",voucher_url:null});
        const vUrl = await db().uploadVoucher(voucher, pedido.id);
        pedido.voucher_url=vUrl;
        await db().marcarNumeros(nums);
      }
      await sendEmail({...form,numeros:nums,total});
      notifyWhatsApp({nombre:form.nombre,email:form.email,numeros:nums,total});
      setConfirmed(pedido);
      setStep("success");
    } catch(err){
      setSubmitErr("Ocurrió un error. Intenta nuevamente o contacta a la iglesia.");
      console.error(err);
    } finally { setSubmitting(false); }
  };

  if(step==="success") return (
    <SuccessView
      nombre={form.nombre} email={form.email} numeros={[...selected].sort((a,b)=>a-b)} total={total}
      onReset={()=>{setStep("select");setSelected(new Set());setForm({nombre:"",rut:"",email:"",telefono:""});setVoucher(null);setVoucherPreview(null);}}
    />
  );

  if(step==="form") return (
    <FormView
      form={form} setForm={setForm} errors={errors} setErrors={setErrors}
      voucher={voucher} setVoucher={setVoucher} voucherPreview={voucherPreview} setVoucherPreview={setVoucherPreview}
      selected={selected} total={total} submitting={submitting} submitErr={submitErr}
      onBack={()=>setStep("select")} onSubmit={handleSubmit}
    />
  );

  return (
    <SelectView
      tomados={tomados} selected={selected} toggle={toggle} total={total}
      onContinue={()=>setStep("form")}
    />
  );
}

// ─── Selección de números ─────────────────────────────────────────────────────
function SelectView({tomados, selected, toggle, total, onContinue}) {
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState("todos"); // todos | disponibles | vendidos
  const [page, setPage] = useState(0);
  const PER_PAGE = 200;

  const disponibles = CONFIG.totalNumeros - tomados.size;
  const porcentaje = Math.round((tomados.size / CONFIG.totalNumeros) * 100);

  const numeros = useMemo(()=>{
    let arr = Array.from({length:CONFIG.totalNumeros},(_,i)=>i+1);
    if(query.trim()) {
      const q = query.trim();
      arr = arr.filter(n=>pad(n).includes(q) || String(n).includes(q));
    }
    if(filtro==="disponibles") arr=arr.filter(n=>!tomados.has(n));
    if(filtro==="vendidos") arr=arr.filter(n=>tomados.has(n));
    return arr;
  },[query, filtro, tomados]);

  useEffect(()=>setPage(0),[query,filtro]);

  const paginated = numeros.slice(page*PER_PAGE, (page+1)*PER_PAGE);
  const totalPages = Math.ceil(numeros.length/PER_PAGE);

  const pickRandom = ()=>{
    const libres = Array.from({length:CONFIG.totalNumeros},(_,i)=>i+1).filter(n=>!tomados.has(n)&&!selected.has(n));
    const cant = Math.min(5, CONFIG.maxPorPersona - selected.size, libres.length);
    if(cant<=0) return;
    const shuffled = libres.sort(()=>Math.random()-0.5).slice(0,cant);
    shuffled.forEach(n=>toggle(n));
  };

  return (
    <main style={S.main}>
      {/* Hero */}
      <div style={S.hero} className="fade">
        <div style={S.heroBadge}>✝ RIFA BENÉFICA</div>
        <h1 style={S.heroTitle}>{CONFIG.premio}</h1>
        <p style={S.heroDate}>Sorteo: {CONFIG.fechaSorteo}</p>

        {/* Progress bar */}
        <div style={S.progressWrap}>
          <div style={S.progressBar}>
            <div style={{...S.progressFill, width:`${porcentaje}%`}} />
          </div>
          <div style={S.progressLabels}>
            <span style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>{tomados.size.toLocaleString("es-CL")} vendidos</span>
            <span style={{color:gold,fontWeight:700}}>{porcentaje}% vendido</span>
            <span style={{color:"rgba(255,255,255,0.6)",fontSize:12}}>{disponibles.toLocaleString("es-CL")} disponibles</span>
          </div>
        </div>

        <div style={S.heroKpis}>
          <div style={S.heroKpi}><span style={S.heroKpiNum}>{formatCLP(CONFIG.precioPorNumero)}</span><span style={S.heroKpiLbl}>por número</span></div>
          <div style={S.kpiDiv}/>
          <div style={S.heroKpi}><span style={S.heroKpiNum}>{CONFIG.maxPorPersona}</span><span style={S.heroKpiLbl}>máx. por persona</span></div>
          <div style={S.kpiDiv}/>
          <div style={S.heroKpi}><span style={S.heroKpiNum}>{CONFIG.totalNumeros.toLocaleString("es-CL")}</span><span style={S.heroKpiLbl}>números totales</span></div>
        </div>
      </div>

      {/* Controles */}
      <div style={S.controls} className="fade">
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>🔍</span>
          <input
            placeholder="Buscar número (ej: 0042)"
            value={query} onChange={e=>setQuery(e.target.value)}
            style={S.searchInput}
          />
          {query && <button style={S.clearBtn} onClick={()=>setQuery("")}>✕</button>}
        </div>
        <div style={S.filtros}>
          {["todos","disponibles","vendidos"].map(f=>(
            <button key={f} style={{...S.filtroBtn,...(filtro===f?S.filtroBtnActive:{})}} onClick={()=>setFiltro(f)}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
        </div>
        <button style={S.randomBtn} onClick={pickRandom} disabled={selected.size>=CONFIG.maxPorPersona}>
          🎲 Elegir 5 al azar
        </button>
      </div>

      {/* Leyenda */}
      <div style={S.legend}>
        {[
          {bg:"#fff",border:`1.5px solid #ddd`,lbl:"Disponible"},
          {bg:gold,border:`1.5px solid ${gold}`,lbl:"Seleccionado"},
          {bg:"#e2e2e2",border:"1.5px solid #ccc",lbl:"Vendido"},
        ].map(({bg,border,lbl})=>(
          <div key={lbl} style={S.legendItem}>
            <span style={{...S.legendDot,background:bg,border}}/>
            <span>{lbl}</span>
          </div>
        ))}
      </div>

      {/* Resultados */}
      <div style={S.resultsInfo}>
        Mostrando {paginated.length} de {numeros.length.toLocaleString("es-CL")} números
        {query && ` · Búsqueda: "${query}"`}
      </div>

      {/* Grid virtualizado por páginas */}
      <div style={S.grid}>
        {paginated.map(n=>{
          const taken=tomados.has(n), sel=selected.has(n);
          return (
            <button key={n} onClick={()=>toggle(n)} disabled={taken}
              style={{...S.numBtn,...(taken?S.numTaken:sel?S.numSel:S.numAvail)}}
              title={taken?"Vendido":sel?"Clic para quitar":"Clic para seleccionar"}
            >
              {pad(n)}
            </button>
          );
        })}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div style={S.pagination}>
          <button style={S.pageBtn} disabled={page===0} onClick={()=>setPage(p=>p-1)}>← Anterior</button>
          <span style={S.pageInfo}>Página {page+1} de {totalPages}</span>
          <button style={S.pageBtn} disabled={page>=totalPages-1} onClick={()=>setPage(p=>p+1)}>Siguiente →</button>
        </div>
      )}

      <div style={{height:110}}/>

      {/* Barra inferior */}
      <div style={S.stickyBar}>
        <div>
          {selected.size>0 ? (
            <>
              <div style={S.stickyNums}>
                {[...selected].sort((a,b)=>a-b).slice(0,8).map(n=>(
                  <span key={n} style={S.stickyTag}>{pad(n)}</span>
                ))}
                {selected.size>8 && <span style={S.stickyMore}>+{selected.size-8}</span>}
              </div>
              <div style={S.stickyTotal}>{formatCLP(total)}</div>
            </>
          ) : (
            <div style={S.stickyEmpty}>Selecciona tus números 👆</div>
          )}
        </div>
        <button
          disabled={selected.size===0}
          style={{...S.btnPrimary,...(selected.size===0?{opacity:.4,cursor:"not-allowed"}:{})}}
          onClick={onContinue}
        >
          Continuar ({selected.size}) →
        </button>
      </div>
    </main>
  );
}

// ─── Formulario ───────────────────────────────────────────────────────────────
function FormView({form,setForm,errors,setErrors,voucher,setVoucher,voucherPreview,setVoucherPreview,selected,total,submitting,submitErr,onBack,onSubmit}) {
  const nums=[...selected].sort((a,b)=>a-b);

  const handleFile=e=>{
    const f=e.target.files[0]; if(!f) return;
    if(f.size>10*1024*1024){setErrors({...errors,voucher:"Máximo 10MB"});return;}
    setVoucher(f); setVoucherPreview(URL.createObjectURL(f));
    setErrors({...errors,voucher:null});
  };

  return (
    <main style={S.main}>
      <div style={S.card} className="fade">
        <button style={S.backBtn} onClick={onBack}>← Volver</button>
        <h2 style={S.cardTitle}>Datos y comprobante de pago</h2>

        {/* Resumen */}
        <div style={S.summaryBox}>
          <div style={S.summaryRow}>
            <span style={S.summaryLbl}>Números seleccionados ({nums.length})</span>
          </div>
          <div style={S.numsWrap}>
            {nums.map(n=><span key={n} style={S.numTagForm}>{pad(n)}</span>)}
          </div>
          <div style={S.summaryDiv}/>
          <div style={S.summaryRow}>
            <span style={S.summaryLbl}>Total a transferir</span>
            <span style={{color:gold,fontWeight:900,fontSize:22,fontFamily:"'Playfair Display',serif"}}>{formatCLP(total)}</span>
          </div>
        </div>

        {/* Datos bancarios */}
        <div style={S.bankBox}>
          <p style={S.bankTitle}>📲 Transfiere a esta cuenta</p>
          {[["Banco",CONFIG.banco],["Tipo",CONFIG.tipoCuenta],["N° Cuenta",CONFIG.numeroCuenta],["Nombre",CONFIG.nombreCuenta],["RUT",CONFIG.rutCuenta]].map(([k,v])=>(
            <div key={k} style={S.bankRow}>
              <span style={S.bankKey}>{k}</span>
              <span style={S.bankVal}>{v}</span>
            </div>
          ))}
        </div>

        {/* Campos */}
        <div style={S.fields}>
          {[
            {k:"nombre",lbl:"Nombre completo",t:"text",ph:"Juan Pérez González"},
            {k:"rut",lbl:"RUT",t:"text",ph:"12.345.678-9"},
            {k:"email",lbl:"Correo electrónico",t:"email",ph:"juan@ejemplo.cl"},
            {k:"telefono",lbl:"Teléfono / WhatsApp",t:"tel",ph:"+56 9 8765 4321"},
          ].map(({k,lbl,t,ph})=>(
            <div key={k} style={S.fieldGroup}>
              <label style={S.label}>{lbl}</label>
              <input type={t} placeholder={ph} value={form[k]}
                onChange={e=>{setForm({...form,[k]:e.target.value});setErrors({...errors,[k]:null})}}
                style={{...S.input,...(errors[k]?{borderColor:rose}:{})}}
              />
              {errors[k]&&<span style={S.errMsg}>{errors[k]}</span>}
            </div>
          ))}

          {/* Upload */}
          <div style={S.fieldGroup}>
            <label style={S.label}>Comprobante de transferencia</label>
            <label style={{...S.uploadZone,...(errors.voucher?{borderColor:rose}:{})}}>
              <input type="file" accept="image/*,application/pdf" onChange={handleFile} style={{display:"none"}}/>
              {voucherPreview ? (
                <div style={{textAlign:"center"}}>
                  {voucher?.type==="application/pdf"
                    ? <div style={S.pdfBadge}>📄 {voucher.name}</div>
                    : <img src={voucherPreview} alt="comprobante" style={S.voucherImg}/>
                  }
                  <div style={{color:gold,fontSize:12,marginTop:8}}>Toca para cambiar</div>
                </div>
              ):(
                <div style={S.uploadInner}>
                  <span style={{fontSize:36}}>📎</span>
                  <span style={S.uploadTxt}>Subir comprobante</span>
                  <span style={S.uploadHint}>JPG, PNG o PDF · Máx 10MB</span>
                </div>
              )}
            </label>
            {errors.voucher&&<span style={S.errMsg}>{errors.voucher}</span>}
          </div>
        </div>

        {submitErr&&<div style={S.alertErr}>{submitErr}</div>}

        <button
          style={{...S.btnPrimary,width:"100%",fontSize:16,padding:"14px",...(submitting?{opacity:.7,cursor:"not-allowed"}:{})}}
          onClick={onSubmit} disabled={submitting}
        >
          {submitting&&<span style={S.spinner}/>}
          {submitting?" Enviando..." : "✅ Confirmar participación"}
        </button>
        <p style={S.legal}>Al confirmar aceptas que tus datos serán usados únicamente para esta rifa.</p>
      </div>
    </main>
  );
}

// ─── Éxito ────────────────────────────────────────────────────────────────────
function SuccessView({nombre,email,numeros,total,onReset}) {
  return (
    <main style={S.main}>
      <div style={{...S.card,textAlign:"center"}} className="fade">
        <div style={{fontSize:72,marginBottom:12}}>🎉</div>
        <h2 style={{...S.cardTitle,textAlign:"center"}}>¡Gracias, {nombre.split(" ")[0]}!</h2>
        <p style={{color:"#666",lineHeight:1.8,marginBottom:20,fontSize:14}}>
          Tu participación fue recibida. Verificaremos tu transferencia y recibirás confirmación en{" "}
          <strong>{email}</strong> dentro de 24 horas.
        </p>
        <div style={S.successNums}>
          {numeros.slice(0,20).map(n=><span key={n} style={S.successNum}>{pad(n)}</span>)}
          {numeros.length>20&&<span style={{...S.successNum,background:"#eee",color:"#999"}}>+{numeros.length-20} más</span>}
        </div>
        <div style={S.infoBox}>
          <div>🎁 <strong>{CONFIG.premio}</strong></div>
          <div>📅 <strong>{CONFIG.fechaSorteo}</strong></div>
          <div>💰 Total: <strong>{formatCLP(total)}</strong></div>
          <div>🔢 {numeros.length} número{numeros.length>1?"s":""} reservado{numeros.length>1?"s":""}</div>
        </div>
        <p style={{color:"#aaa",fontSize:12,margin:"16px 0"}}>Te notificaremos por WhatsApp y correo electrónico.</p>
        <button style={{...S.btnPrimary,width:"100%"}} onClick={onReset}>Comprar más números</button>
      </div>
    </main>
  );
}

// ─── Panel Admin ──────────────────────────────────────────────────────────────
function AdminView() {
  const [pedidos,setPedidos]=useState([]);
  const [loading,setLoading]=useState(true);
  const [filtro,setFiltro]=useState("todos");
  const [search,setSearch]=useState("");
  const [updating,setUpdating]=useState(null);
  const [adminPage,setAdminPage]=useState(0);
  const ADMIN_PER_PAGE=20;

  const fetchPedidos=useCallback(async()=>{
    setLoading(true);
    try {
      const data = isDemo ? demoPedidos : await db().getPedidos();
      setPedidos(data||[]);
    } catch(e){console.error(e);}
    setLoading(false);
  },[]);

  useEffect(()=>{fetchPedidos();},[fetchPedidos]);

  const cambiarEstado=async(id,estado)=>{
    setUpdating(id);
    if(isDemo){
      await new Promise(r=>setTimeout(r,700));
      demoPedidos=demoPedidos.map(p=>p.id===id?{...p,estado}:p);
      setPedidos([...demoPedidos]);
    } else {
      await db().updateEstado(id,estado);
      await fetchPedidos();
    }
    setUpdating(null);
  };

  const filtrados = pedidos.filter(p=>{
    const okF = filtro==="todos"||p.estado===filtro;
    const q=search.toLowerCase();
    const okS = !q||p.nombre?.toLowerCase().includes(q)||p.email?.toLowerCase().includes(q)||p.rut?.includes(q);
    return okF&&okS;
  });

  const paginatedAdmin = filtrados.slice(adminPage*ADMIN_PER_PAGE,(adminPage+1)*ADMIN_PER_PAGE);
  const adminPages = Math.ceil(filtrados.length/ADMIN_PER_PAGE);

  const totalRecaudado = pedidos.filter(p=>p.estado!=="rechazado").reduce((a,p)=>a+(p.total||0),0);
  const numerosVendidos = pedidos.filter(p=>p.estado!=="rechazado").reduce((a,p)=>a+(p.numeros?.length||0),0);

  return (
    <main style={S.main} className="fade">
      <h2 style={{...S.cardTitle,textAlign:"center",marginBottom:4}}>Panel de Administración</h2>
      <p style={{textAlign:"center",color:"#aaa",fontSize:12,marginBottom:24}}>
        {isDemo?"Modo Demo":"Tiempo real"} · {new Date().toLocaleString("es-CL")}
      </p>

      {/* KPIs */}
      <div style={S.kpiGrid}>
        {[
          {icon:"💰",val:formatCLP(totalRecaudado),lbl:"Total recaudado",c:emerald},
          {icon:"🎟️",val:numerosVendidos.toLocaleString("es-CL"),lbl:"Números vendidos",c:navy},
          {icon:"✅",val:pedidos.filter(p=>p.estado==="confirmado").length,lbl:"Confirmados",c:emerald},
          {icon:"⏳",val:pedidos.filter(p=>p.estado==="pendiente").length,lbl:"Pendientes",c:"#e67e22"},
          {icon:"❌",val:pedidos.filter(p=>p.estado==="rechazado").length,lbl:"Rechazados",c:rose},
          {icon:"📊",val:`${Math.round(numerosVendidos/CONFIG.totalNumeros*100)}%`,lbl:"Avance rifa",c:gold},
        ].map(({icon,val,lbl,c})=>(
          <div key={lbl} style={S.kpiCard}>
            <div style={{fontSize:22}}>{icon}</div>
            <div style={{...S.kpiVal,color:c}}>{val}</div>
            <div style={S.kpiLbl}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={S.filterBar}>
        <input placeholder="🔍 Buscar nombre, RUT o email..." value={search}
          onChange={e=>{setSearch(e.target.value);setAdminPage(0)}} style={{...S.input,flex:1,minWidth:0}}/>
        <select value={filtro} onChange={e=>{setFiltro(e.target.value);setAdminPage(0)}} style={{...S.input,width:140}}>
          <option value="todos">Todos ({pedidos.length})</option>
          <option value="pendiente">Pendientes ({pedidos.filter(p=>p.estado==="pendiente").length})</option>
          <option value="confirmado">Confirmados ({pedidos.filter(p=>p.estado==="confirmado").length})</option>
          <option value="rechazado">Rechazados ({pedidos.filter(p=>p.estado==="rechazado").length})</option>
        </select>
        <button style={S.refreshBtn} onClick={fetchPedidos} title="Actualizar">🔄</button>
      </div>

      <div style={{color:"#aaa",fontSize:12,marginBottom:12}}>
        {filtrados.length} resultado{filtrados.length!==1?"s":""}
      </div>

      {loading ? (
        <div style={{display:"flex",justifyContent:"center",padding:60}}>
          <div style={{...S.spinner,width:36,height:36,borderWidth:3}}/>
        </div>
      ) : paginatedAdmin.length===0 ? (
        <div style={{textAlign:"center",color:"#ccc",padding:48,fontSize:16}}>Sin pedidos</div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {paginatedAdmin.map(p=>(
            <PedidoCard key={p.id} pedido={p} onCambiar={cambiarEstado} updating={updating===p.id}/>
          ))}
        </div>
      )}

      {adminPages>1&&(
        <div style={{...S.pagination,marginTop:20}}>
          <button style={S.pageBtn} disabled={adminPage===0} onClick={()=>setAdminPage(p=>p-1)}>← Anterior</button>
          <span style={S.pageInfo}>Página {adminPage+1} de {adminPages}</span>
          <button style={S.pageBtn} disabled={adminPage>=adminPages-1} onClick={()=>setAdminPage(p=>p+1)}>Siguiente →</button>
        </div>
      )}
    </main>
  );
}

function PedidoCard({pedido,onCambiar,updating}) {
  const [open,setOpen]=useState(false);
  const est={
    confirmado:{bg:"#e8f5e9",c:emerald,lbl:"✅ Confirmado"},
    pendiente:{bg:"#fff8e1",c:"#e67e22",lbl:"⏳ Pendiente"},
    rechazado:{bg:"#fde8e8",c:rose,lbl:"❌ Rechazado"},
  }[pedido.estado]||{bg:"#eee",c:"#999",lbl:pedido.estado};

  return (
    <div style={S.pedidoCard}>
      <div style={S.pedidoHead} onClick={()=>setOpen(!open)}>
        <div style={{flex:1,minWidth:0}}>
          <div style={S.pedidoNombre}>{pedido.nombre}</div>
          <div style={S.pedidoMeta}>{pedido.email} · {pedido.telefono}</div>
          <div style={S.pedidoNums}>
            {(pedido.numeros||[]).slice(0,10).map(n=><span key={n} style={S.numTagAdmin}>{pad(n)}</span>)}
            {(pedido.numeros||[]).length>10&&<span style={{...S.numTagAdmin,background:"#f0f0f0",color:"#999"}}>+{pedido.numeros.length-10}</span>}
          </div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{...S.estadoBadge,background:est.bg,color:est.c}}>{est.lbl}</div>
          <div style={{fontWeight:900,color:navy,fontSize:15,marginTop:4}}>{formatCLP(pedido.total)}</div>
          <div style={{color:"#ccc",fontSize:11}}>{new Date(pedido.created_at).toLocaleString("es-CL")}</div>
          <div style={{color:"#bbb",fontSize:11,marginTop:2}}>{open?"▲":"▼"} {open?"Cerrar":"Ver detalles"}</div>
        </div>
      </div>
      {open&&(
        <div style={S.pedidoBody} className="fade">
          <div style={S.detailGrid}>
            <div style={S.detailRow}><span style={S.detailK}>RUT</span><span>{pedido.rut}</span></div>
            <div style={S.detailRow}><span style={S.detailK}>Números ({(pedido.numeros||[]).length})</span><span style={{fontFamily:"monospace",fontSize:12}}>{(pedido.numeros||[]).map(pad).join(", ")}</span></div>
            {pedido.voucher_url&&(
              <div style={S.detailRow}><span style={S.detailK}>Comprobante</span><a href={pedido.voucher_url} target="_blank" rel="noreferrer" style={{color:gold,fontWeight:700}}>Ver archivo ↗</a></div>
            )}
          </div>
          <div style={S.actionRow}>
            {pedido.estado==="pendiente"&&<>
              <button style={{...S.btnAction,background:emerald}} disabled={updating} onClick={()=>onCambiar(pedido.id,"confirmado")}>{updating?"...":"✅ Confirmar pago"}</button>
              <button style={{...S.btnAction,background:rose}} disabled={updating} onClick={()=>onCambiar(pedido.id,"rechazado")}>{updating?"...":"❌ Rechazar"}</button>
            </>}
            {pedido.estado==="confirmado"&&<button style={{...S.btnAction,background:rose}} disabled={updating} onClick={()=>onCambiar(pedido.id,"rechazado")}>❌ Marcar rechazado</button>}
            {pedido.estado==="rechazado"&&<button style={{...S.btnAction,background:"#888"}} disabled={updating} onClick={()=>onCambiar(pedido.id,"pendiente")}>↩️ Volver a pendiente</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const S = {
  root:{minHeight:"100vh",background:cream,fontFamily:"'DM Sans',sans-serif",color:navy},
  nav:{background:navy,padding:"12px 20px",position:"sticky",top:0,zIndex:200,boxShadow:"0 2px 20px rgba(0,0,0,0.35)"},
  navIn:{maxWidth:700,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center"},
  brand:{display:"flex",gap:12,alignItems:"center",cursor:"pointer"},
  cross:{fontSize:30,color:gold,textShadow:`0 0 20px ${gold}66`},
  brandName:{color:"#fff",fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:700},
  brandSub:{color:`${gold}bb`,fontSize:11,letterSpacing:1.5,textTransform:"uppercase"},
  navBtn:{background:"transparent",border:`1px solid ${gold}66`,color:gold,borderRadius:8,padding:"6px 14px",cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif"},
  demoBanner:{background:"#fff3cd",color:"#7d5a00",padding:"9px 20px",textAlign:"center",fontSize:13,borderBottom:"1px solid #ffe08a"},
  main:{maxWidth:700,margin:"0 auto",padding:"20px 14px 40px"},

  // Hero
  hero:{background:`linear-gradient(145deg,${navy} 0%,#183060 100%)`,borderRadius:20,padding:"28px 22px 24px",marginBottom:20,border:`2px solid ${gold}44`,boxShadow:"0 8px 40px rgba(13,27,62,0.3)"},
  heroBadge:{color:gold,fontSize:11,letterSpacing:3,textTransform:"uppercase",marginBottom:10,textAlign:"center"},
  heroTitle:{color:"#fff",fontFamily:"'Playfair Display',serif",fontSize:26,textAlign:"center",marginBottom:6,lineHeight:1.3},
  heroDate:{color:"rgba(255,255,255,0.5)",textAlign:"center",fontSize:13,marginBottom:20},
  progressWrap:{marginBottom:20},
  progressBar:{background:"rgba(255,255,255,0.12)",borderRadius:99,height:10,overflow:"hidden",marginBottom:6},
  progressFill:{height:"100%",background:`linear-gradient(90deg,${gold},#e8b84b)`,borderRadius:99,transition:"width .5s ease"},
  progressLabels:{display:"flex",justifyContent:"space-between",fontSize:11},
  heroKpis:{display:"flex",justifyContent:"center",alignItems:"center"},
  heroKpi:{textAlign:"center",padding:"0 18px"},
  heroKpiNum:{display:"block",color:gold,fontSize:22,fontWeight:900,fontFamily:"'Playfair Display',serif"},
  heroKpiLbl:{color:"rgba(255,255,255,0.45)",fontSize:11,letterSpacing:0.5},
  kpiDiv:{width:1,height:36,background:"rgba(255,255,255,0.12)"},

  // Controles
  controls:{display:"flex",flexDirection:"column",gap:10,marginBottom:14},
  searchWrap:{position:"relative",display:"flex",alignItems:"center"},
  searchIcon:{position:"absolute",left:12,fontSize:16,pointerEvents:"none"},
  searchInput:{width:"100%",border:"1.5px solid #e0d9cc",borderRadius:11,padding:"10px 36px 10px 38px",fontSize:15,fontFamily:"'DM Sans',sans-serif",color:navy,background:"#fff"},
  clearBtn:{position:"absolute",right:10,background:"none",border:"none",color:"#aaa",cursor:"pointer",fontSize:14},
  filtros:{display:"flex",gap:8},
  filtroBtn:{background:"#fff",border:"1.5px solid #e0d9cc",borderRadius:99,padding:"6px 14px",cursor:"pointer",fontSize:13,color:"#777",fontFamily:"'DM Sans',sans-serif"},
  filtroBtnActive:{background:navy,borderColor:navy,color:"#fff",fontWeight:700},
  randomBtn:{background:`${gold}18`,border:`1.5px solid ${gold}`,color:navy,borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",alignSelf:"flex-start"},

  legend:{display:"flex",gap:16,marginBottom:10,flexWrap:"wrap"},
  legendItem:{display:"flex",gap:6,alignItems:"center",fontSize:12,color:"#777"},
  legendDot:{width:15,height:15,borderRadius:4,display:"inline-block"},
  resultsInfo:{color:"#aaa",fontSize:12,marginBottom:10},

  // Grid
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(52px,1fr))",gap:5,marginBottom:16},
  numBtn:{padding:"7px 4px",borderRadius:8,border:"none",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"monospace",transition:"transform .12s"},
  numAvail:{background:"#fff",color:navy,border:"1.5px solid #e0d9cc",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"},
  numSel:{background:gold,color:"#fff",border:`1.5px solid ${gold}`,boxShadow:`0 3px 10px ${gold}55`,transform:"scale(1.08)"},
  numTaken:{background:"#e8e8e8",color:"#c0c0c0",cursor:"not-allowed",textDecoration:"line-through",border:"1.5px solid #d8d8d8"},

  pagination:{display:"flex",justifyContent:"center",alignItems:"center",gap:12,marginTop:16},
  pageBtn:{background:"#fff",border:`1.5px solid ${gold}`,color:navy,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:600},
  pageInfo:{fontSize:13,color:"#888"},

  stickyBar:{position:"fixed",bottom:0,left:0,right:0,background:navy,padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,boxShadow:"0 -4px 24px rgba(0,0,0,0.3)",zIndex:100},
  stickyNums:{display:"flex",gap:4,flexWrap:"wrap",maxWidth:260,marginBottom:3},
  stickyTag:{background:`${gold}33`,color:gold,borderRadius:5,padding:"2px 6px",fontSize:11,fontFamily:"monospace",fontWeight:700},
  stickyMore:{background:"rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.5)",borderRadius:5,padding:"2px 6px",fontSize:11},
  stickyTotal:{color:gold,fontSize:18,fontWeight:900,fontFamily:"'Playfair Display',serif"},
  stickyEmpty:{color:"rgba(255,255,255,0.4)",fontSize:14},

  btnPrimary:{background:`linear-gradient(135deg,${gold},#a8791e)`,color:"#fff",border:"none",borderRadius:12,padding:"11px 22px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,whiteSpace:"nowrap"},

  // Card / Form
  card:{background:"#fff",borderRadius:20,padding:"24px 18px",boxShadow:"0 4px 28px rgba(0,0,0,0.09)"},
  cardTitle:{fontFamily:"'Playfair Display',serif",fontSize:22,color:navy,marginBottom:20},
  backBtn:{background:"none",border:"none",color:"#aaa",fontSize:13,cursor:"pointer",marginBottom:16,padding:0,fontFamily:"'DM Sans',sans-serif"},
  summaryBox:{background:"#f9f5eb",borderRadius:14,padding:16,marginBottom:16,border:`1px solid ${gold}33`},
  summaryRow:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12},
  summaryLbl:{color:"#777",fontSize:13},
  numsWrap:{display:"flex",flexWrap:"wrap",gap:5,marginTop:10,marginBottom:10},
  numTagForm:{background:`${gold}22`,color:navy,borderRadius:6,padding:"3px 8px",fontFamily:"monospace",fontWeight:700,fontSize:12},
  summaryDiv:{height:1,background:`${gold}33`,margin:"10px 0"},
  bankBox:{background:`linear-gradient(135deg,${navy}08,${gold}08)`,border:`1px solid ${gold}44`,borderRadius:12,padding:16,marginBottom:20},
  bankTitle:{fontWeight:700,color:navy,fontSize:13,marginBottom:10},
  bankRow:{display:"flex",gap:8,fontSize:13,marginBottom:5},
  bankKey:{color:"#999",minWidth:80,flexShrink:0},
  bankVal:{color:navy,fontWeight:700},
  fields:{display:"flex",flexDirection:"column",gap:16,marginBottom:20},
  fieldGroup:{display:"flex",flexDirection:"column",gap:4},
  label:{fontSize:11,fontWeight:700,color:"#777",textTransform:"uppercase",letterSpacing:0.6},
  input:{border:"1.5px solid #e0d9cc",borderRadius:10,padding:"10px 14px",fontSize:15,fontFamily:"'DM Sans',sans-serif",color:navy,background:"#fafaf8",transition:"border-color .2s"},
  errMsg:{color:rose,fontSize:12},
  alertErr:{background:"#fde8e8",color:rose,borderRadius:10,padding:"12px 16px",marginBottom:16,fontSize:13},
  uploadZone:{display:"block",border:`2px dashed ${gold}`,borderRadius:12,padding:20,textAlign:"center",cursor:"pointer",background:"#fdf8f0",transition:"border-color .2s"},
  uploadInner:{display:"flex",flexDirection:"column",gap:6,alignItems:"center"},
  uploadTxt:{color:navy,fontSize:14,fontWeight:700},
  uploadHint:{color:"#bbb",fontSize:12},
  voucherImg:{maxWidth:"100%",maxHeight:180,borderRadius:8,objectFit:"contain"},
  pdfBadge:{background:"#fde8e8",color:rose,padding:"10px 16px",borderRadius:8,fontWeight:700,fontSize:13},
  legal:{textAlign:"center",color:"#ccc",fontSize:11,marginTop:12},
  spinner:{display:"inline-block",width:16,height:16,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin .7s linear infinite"},

  // Success
  successNums:{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginBottom:20},
  successNum:{background:gold,color:"#fff",borderRadius:8,padding:"4px 10px",fontFamily:"monospace",fontWeight:700,fontSize:13},
  infoBox:{background:"#f9f5eb",borderRadius:12,padding:16,display:"flex",flexDirection:"column",gap:8,fontSize:14,lineHeight:1.7,textAlign:"left"},

  // Login
  loginWrap:{display:"flex",justifyContent:"center",alignItems:"center",minHeight:"80vh",padding:20},
  loginCard:{background:"#fff",borderRadius:20,padding:32,width:"100%",maxWidth:360,boxShadow:"0 8px 32px rgba(0,0,0,0.12)",display:"flex",flexDirection:"column",gap:16},
  loginTitle:{fontFamily:"'Playfair Display',serif",textAlign:"center",color:navy,fontSize:22},

  // Admin
  kpiGrid:{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20},
  kpiCard:{background:"#fff",borderRadius:14,padding:"14px 10px",textAlign:"center",boxShadow:"0 2px 12px rgba(0,0,0,0.07)",display:"flex",flexDirection:"column",gap:4,alignItems:"center"},
  kpiVal:{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:900},
  kpiLbl:{color:"#aaa",fontSize:11},
  filterBar:{display:"flex",gap:8,marginBottom:10,alignItems:"center",flexWrap:"wrap"},
  refreshBtn:{background:"#fff",border:"1.5px solid #e0d9cc",borderRadius:10,padding:"10px 12px",cursor:"pointer",fontSize:16,flexShrink:0},
  pedidoCard:{background:"#fff",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,0.07)"},
  pedidoHead:{padding:"14px 16px",display:"flex",gap:12,cursor:"pointer",alignItems:"flex-start"},
  pedidoNombre:{fontWeight:700,color:navy,fontSize:15,marginBottom:2},
  pedidoMeta:{color:"#aaa",fontSize:12,marginBottom:6,wordBreak:"break-all"},
  pedidoNums:{display:"flex",flexWrap:"wrap",gap:4},
  numTagAdmin:{background:`${gold}18`,color:navy,borderRadius:5,padding:"2px 6px",fontSize:10,fontFamily:"monospace",fontWeight:700},
  estadoBadge:{display:"inline-block",borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:700,marginBottom:4,whiteSpace:"nowrap"},
  pedidoBody:{borderTop:"1px solid #f0f0f0",padding:"14px 16px",background:"#fafaf8"},
  detailGrid:{display:"flex",flexDirection:"column",gap:8,marginBottom:14},
  detailRow:{display:"flex",gap:10,fontSize:13,alignItems:"flex-start"},
  detailK:{color:"#aaa",minWidth:100,flexShrink:0,fontSize:12},
  actionRow:{display:"flex",gap:8,flexWrap:"wrap"},
  btnAction:{flex:1,color:"#fff",border:"none",borderRadius:9,padding:"10px",fontWeight:700,cursor:"pointer",fontSize:13,fontFamily:"'DM Sans',sans-serif",minWidth:100},
};