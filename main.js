/* TBORGES v3 - Configurações, perfil, recuperação de senha, temas, filtros e despesas */
import { createClient } from '@supabase/supabase-js'
import './style.css'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(url || 'https://YOUR_PROJECT.supabase.co', key || 'YOUR_PUBLISHABLE_KEY')

let user=null, vehicles=[], fuelings=[], maintenances=[], trips=[], expenses=[], activeVehicleId=null
let page='dashboard', period='current', activeModuleFilter='all'
const app=document.getElementById('root')
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0)
const num=v=>Number(v)||0
const dateBR=s=>s?new Date(s+'T12:00:00').toLocaleDateString('pt-BR'):'—'
const today=()=>new Date().toISOString().slice(0,10)
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const typeName=t=>({gas:'Gasolina',alc:'Álcool',gnv:'GNV'}[t]||t)
const unit=t=>t==='gnv'?'m³':'L'
const platformName=p=>({uber:'Uber','99':'99',particular:'Particular'}[p]||p)
const platformClass=p=>({uber:'uber','99':'p99',particular:'particular'}[p]||'')
function toast(m){const e=document.getElementById('toast');if(!e)return;e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}
function activeVehicle(){return vehicles.find(v=>v.id===activeVehicleId)||vehicles.find(v=>v.active)||vehicles}
function saveActiveLocal(){if(activeVehicleId)localStorage.setItem('tborges_active_vehicle',activeVehicleId)}
function range(){
 const now=new Date(), end=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59)
 if(period==='current')return[new Date(now.getFullYear(),now.getMonth(),1),end]
 if(period==='previous')return[new Date(now.getFullYear(),now.getMonth()-1,1),new Date(now.getFullYear(),now.getMonth(),0,23,59,59)]
 const n=Number(period)||6;return[new Date(now.getFullYear(),now.getMonth()-(n-1),1),end]
}
function inRange(s){const[a,b]=range(),d=new Date(s+'T12:00:00');return d>=a&&d<=b}
function periodName(){return period==='current'?'Mês atual':period==='previous'?'Mês anterior':`Últimos ${period} meses`}
function vehicleFilter(arr,v=activeVehicle()){return arr.filter(x=>x.vehicle_id===v?.id&&inRange(x.date))}

async function load(){
 const [v,f,m,t,e]=await Promise.all([
  supabase.from('vehicles').select('*').order('created_at'),
  supabase.from('fuelings').select('*').order('date',{ascending:false}),
  supabase.from('maintenances').select('*').order('date',{ascending:false}),
  supabase.from('driver_trips').select('*').order('date',{ascending:false}),
  supabase.from('driver_expenses').select('*').order('date',{ascending:false})
 ])
 const err=v.error||f.error||m.error||t.error||e.error
 if(err){toast('Erro ao carregar: '+err.message);return}
 vehicles=v.data||[];fuelings=f.data||[];maintenances=m.data||[];trips=t.data||[];expenses=e.data||[]
 activeVehicleId=localStorage.getItem('tborges_active_vehicle')||vehicles.find(x=>x.active)?.id||vehicles?.id||null
 saveActiveLocal();render()
}

async function setActive(id){
 activeVehicleId=id;saveActiveLocal()
 const r=await supabase.from('vehicles').update({active:true}).eq('id',id)
 if(r.error)return toast(r.error.message)
 await load();toast('Veículo ativo atualizado.')
}

function header(){
 return `<header><div class="brand"><div class="brand-icon">🚗</div><div><h1>TBORGES Gestão Inteligente</h1><p>Veículo • combustível • manutenção • motorista de aplicativo</p></div></div><div class="userbox">👤 \${esc(user?.email)} <button class="btn secondary" id="logout">Sair</button></div></header>
 <nav>\${[['dashboard','⌂ Dashboard'],['trips','📱 Corridas'],['fuel','⛽ Abastecimentos'],['maint','🔧 Manutenções'],['expenses','💸 Despesas Diversas'],['vehicles','🚘 Veículos'],['data','☁ Dados']].map(([p,t])=>\`<button class="\${page===p?'active':''}" data-page="\${p}">\${t}</button>\`).join('')}</nav>`
}

function dashboard(){
 const v=activeVehicle();if(!v)return \`<div class="card empty"><h3>Comece pelo veículo</h3><p>Cadastre seu carro para controlar operação, combustível e manutenção.</p><button class="btn primary" id="newVehicle">+ Novo veículo</button></div>\`
 
 const fuel=vehicleFilter(fuelings,v),ms=vehicleFilter(maintenances,v),tr=vehicleFilter(trips,v),ex=vehicleFilter(expenses,v)
 const fuelCost=fuel.reduce((a,x)=>a+num(x.total),0),maintCost=ms.reduce((a,x)=>a+num(x.parts)+num(x.labor),0)
 const divCost=ex.reduce((a,x)=>a+num(x.amount),0),carCost=fuelCost+maintCost+divCost
 const gross=tr.reduce((a,x)=>a+num(x.gross),0),net=tr.reduce((a,x)=>a+num(x.net),0),operational=net-carCost
 const os=fuel.map(x=>num(x.odometer)).concat(ms.map(x=>num(x.odometer)),tr.flatMap(x=>[num(x.odometer_start),num(x.odometer_end)]).filter(Boolean));const km=os.length>1?Math.max(...os)-Math.min(...os):0
 const hours=tr.reduce((a,x)=>a+num(x.hours),0),perHour=hours?net/hours:0,perKm=km?net/km:0

 if(page==='dashboard')requestAnimationFrame(()=>{drawEarnings();drawProfit();drawPlatformDonut()})

 return \`<div class="head"><div class="title"><h2>Dashboard executivo</h2><p>\${esc(v.brand)} \${esc(v.model)} \${v.year||''} • \${periodName()}</p></div>
 <div class="filters"><div class="filter"><small>PERÍODO</small><select id="period">\${[['current','Mês atual'],['previous','Mês anterior'],['3','Últimos 3 meses'],['6','Últimos 6 meses'],['12','Últimos 12 meses']].map(([x,t])=>\`<option value="\${x}" \${period===x?'selected':''}>\${t}</option>\`).join('')}</select></div><div class="filter"><small>VEÍCULO ATIVO</small><select id="vehicleSelect">\${vehicles.map(x=>\`<option value="\${x.id}" \${x.id===v.id?'selected':''}>\${esc(x.model)} \${x.year||''}</option>\`).join('')}</select></div></div></div>
 
 <div class="module-filters" style="margin-bottom: 20px; display: flex; gap: 10px; background: rgba(0,0,0,0.03); padding: 10px; border-radius: 8px; flex-wrap: wrap; align-items: center;">
   <b style="font-size: 13px; color: #4b5d73;">📊 FILTROS RÁPIDOS:</b>
   \${[['all','Ver Tudo'],['trips','📱 Corridas'],['fuel','⛽ Abastecimentos'],['maint','🔧 Manutenções'],['expenses','💸 Despesas']].map(([f,t])=>\`<button class="btn \${activeModuleFilter===f?'primary':'secondary'}" data-filter="\${f}" style="padding: 4px 10px; font-size: 12px; margin: 0;">\${t}</button>\`).join('')}
 </div>

 <div class="kpis kpis-6">
   <div class="card kpi accent-blue" style="\${activeModuleFilter==='all'||activeModuleFilter==='trips'?'':'opacity:0.4'}"><small>Saldo bruto</small><strong>\${money(gross)}</strong><span>Faturamento das corridas</span></div>
   <div class="card kpi accent-green" style="\${activeModuleFilter==='all'||activeModuleFilter==='trips'?'':'opacity:0.4'}"><small>Saldo líquido</small><strong>\${money(net)}</strong><span>Após taxas operacionais</span></div>
   <div class="card kpi accent-orange" style="\${activeModuleFilter==='all'||activeModuleFilter!=='trips'?'':'opacity:0.4'}"><small>Despesas Totais</small><strong>\${money(carCost)}</strong><span>Custos de manutenção, combustível e extras</span></div>
   <div class="card kpi accent-dark"><small>Resultado líquido</small><strong>\${money(operational)}</strong><span>Operação real pós-custos</span></div>
   <div class="card kpi" style="\${activeModuleFilter==='all'||activeModuleFilter==='trips'?'':'opacity:0.4'}"><small>R$/hora líquido</small><strong>\${money(perHour)}</strong><span>\${hours.toFixed(1)} h registradas</span></div>
   <div class="card kpi"><small>R$/km líquido</small><strong>\${money(perKm)}</strong><span>\${km.toLocaleString('pt-BR')} km considerados</span></div>
 </div>

 <div class="quick-grid">
   <div class="card quick"><b>📱 Corridas</b><strong>\${tr.length}</strong><span>\${tr.reduce((a,x)=>a+num(x.trip_count),0)} corridas registradas</span></div>
   <div class="card quick"><b>⛽ Abastecimentos</b><strong>\${fuel.length}</strong><span>\${money(fuelCost)} no período</span></div>
   <div class="card quick"><b>🔧 Manutenções</b><strong>\${ms.length}</strong><span>\${money(maintCost)} no período</span></div>
   <div class="card quick"><b>📈 Margem operacional</b><strong>\${net?((operational/net)*100).toFixed(1):'0.0'}%</strong><span>Eficiência da receita</span></div>
 </div>

 <div class="charts charts-3">
   <div class="card chart-card wide"><h3>Faturamento por mês</h3><div class="chart"><canvas id="earningsChart"></canvas></div></div>
   <div class="card chart-card"><h3>Faturamento por plataforma</h3><div class="donut-area"><div class="donut" id="platformDonut"><div class="donut-center"><b>\${money(gross)}</b><small>bruto</small></div></div><div class="legend-box">\${platformLegend(tr)}</div></div></div>
   <div class="card chart-card"><h3>Bruto × líquido × custos</h3><div class="chart"><canvas id="profitChart"></canvas></div></div>
 </div>

 <div class="card table-card"><div class="section-head"><div><h3>Movimentações Recentes</h3><p>Visão de lançamentos baseada no filtro selecionado.</p></div></div>\${renderFilteredTable(v.id)}</div>\`
}

function renderFilteredTable(vid){
  const v=activeVehicle()
  let html = \`<table><thead><tr><th>Data</th><th>Categoria/Ação</th><th>Detalhes / Descrição</th><th>Valor</th></tr></thead><tbody>\`
  let entries = []
  
  if(activeModuleFilter==='all' || activeModuleFilter==='trips'){
    vehicleFilter(trips,v).forEach(x=>entries.push({date:x.date, cat:\`📱 Corrida (\${platformName(x.platform)})\`, desc:\`\${x.trip_count || 1} corridas realizadas\`, value:num(x.gross), isIncome:true}))
  }
  if(activeModuleFilter==='all' || activeModuleFilter==='fuel'){
    vehicleFilter(fuelings,v).forEach(x=>entries.push({date:x.date, cat:\`⛽ Abastecimento\`, desc:\`\${x.quantity} \${unit(x.fuel_type)} @ \${money(x.price_per_unit)}\`, value:num(x.total), isIncome:false}))
  }
  if(activeModuleFilter==='all' || activeModuleFilter==='maint'){
    vehicleFilter(maintenances,v).forEach(x=>entries.push({date:x.date, cat:\`🔧 Manutenção\`, desc:esc(x.service || 'Serviço mecânico'), value:num(x.parts)+num(x.labor), isIncome:false}))
  }
  if(activeModuleFilter==='all' || activeModuleFilter==='expenses'){
    vehicleFilter(expenses,v).forEach(x=>entries.push({date:x.date, cat:\`💸 Despesa (\${esc(x.category)})\`, desc:esc(x.description || 'Sem descrição'), value:num(x.amount), isIncome:false}))
  }
  
  entries.sort((a,b)=>b.date.localeCompare(a.date))
  if(!entries.length)return '<div class="empty">Nenhum lançamento encontrado para os filtros atuais.</div>'
  
  entries.forEach(e=>{
    html += \`<tr><td>\${dateBR(e.date)}</td><td><b>\${e.cat}</b></td><td>\${e.desc}</td><td style="color:\${e.isIncome?'#12a875':'#ef4444'}; font-weight:bold;">\${e.isIncome?'+':'-'} \${money(e.value)}</td></tr>\`
  })
  html += \`</tbody></table>\`
  return html
}

function expensesPage(){
  const v=activeVehicle();if(!v)return emptyVehicle()
  const list=vehicleFilter(expenses,v)
  return \`<div class="head"><div class="title"><h2>💸 Despesas Diversas</h2><p>Controle lanches, pedágios, estacionamento e lava-jatos.</p></div><button class="btn primary" id="newExpenseBtn">+ Nova despesa</button></div>
  <div class="card table-card">\${list.length?\`<table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Ações</th></tr></thead><tbody>\${list.map(x=>\`<tr><td>\${dateBR(x.date)}</td><td><span class="tag info"><b>\${esc(x.category)}</b></span></td><td>\${esc(x.description||'—')}</td><td style="color:#ef4444;font-weight:bold;">\${money(x.amount)}</td><td><div class="actions"><button class="btn danger" data-del-exp="\${x.id}">Excluir</button></div></td></tr>\`).join('')}</tbody></table>\`:'<div class="empty">Nenhuma despesa cadastrada neste período.</div>'}</div>\`
}

function expenseModal(){
  const v=activeVehicle()
  modal(\`<h3>Nova Despesa Diversa</h3><div class="form-grid">
    <div class="field"><label>Data *</label><input id="ed" type="date" value="\${today()}"></div>
    <div class="field"><label>Categoria *</label><select id="ec"><option value="Lanche">🍿 Lanche / Alimentação</option><option value="Pedágio">🛣 Pedágio</option><option value="Lava-jato">🧼 Lava-jato / Limpeza</option><option value="Estacionamento">🅿 Estacionamento</option><option value="Outros">⚙ Outros</option></select></div>
    <div class="field span2"><label>Valor (R$) *</label><input id="ea" type="number" step="0.01" min="0.01" placeholder="0,00"></div>
    <div class="field span2"><label>Descrição / Observação</label><input id="en" placeholder="Detalhes da despesa..."></div>
  </div><div class="modal-foot"><button class="btn secondary" id="cancel">Cancelar</button><button class="btn primary" id="saveExpense">Salvar</button></div>\`)
  
  document.getElementById('saveExpense').onclick=async()=>{
    const amt=num(ea.value);if(!ed.value||amt<=0)return toast('Preencha os campos obrigatórios.')
    const obj={user_id:user.id,vehicle_id:v.id,date:ed.value,category:ec.value,description:en.value,amount:amt}
    const r=await supabase.from('driver_expenses').insert(obj)
    if(r.error)return toast(r.error.message)
    closeModal();await load();toast('Despesa salva com sucesso!')
  }
  document.getElementById('cancel').onclick=closeModal
}

function platformLegend(tr){const vals={uber:0,'99':0,particular:0};tr.forEach(x=>vals[x.platform]+=num(x.gross));const total=Object.values(vals).reduce((a,b)=>a+b,0);return Object.entries(vals).map(([k,val])=>\`<div class="legend-item"><i class="dot \${platformClass(k)}"></i><div><b>\${platformName(k)}</b><span>\${money(val)} • \${total?(val/total*100).toFixed(1):0}%</span></div></div>\`).join('')}
function fuelTable(vid,limit=999){const arr=fuelings.filter(x=>x.vehicle_id===vid).slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,limit);if(!arr.length)return '<div class="empty">Nenhum abastecimento cadastrado.</div>';return \`<table><thead><tr><th>Data</th><th>Tipo</th><th>Hodômetro</th><th>Qtd.</th><th>R$/un.</th><th>Total</th><th>Consumo</th><th>Posto</th><th>Ações</th></tr></thead><tbody>\${arr.map(x=>\`<tr><td>\${dateBR(x.date)}</td><td><span class="tag \${x.fuel_type}">\${typeName(x.fuel_type)}</span></td><td>\${num(x.odometer).toLocaleString('pt-BR')}</td><td>\${num(x.quantity).toFixed(2)} \${unit(x.fuel_type)}</td><td>\${money(x.price_per_unit)}</td><td><b>\${money(x.total)}</b></td><td>\${consumption(x)}</td><td>\${esc(x.station||'—')}</td><td><div class="actions"><button class="btn secondary" data-edit-fuel="\${x.id}">Editar</button><button class="btn danger" data-del-fuel="\${x.id}">Excluir</button></div></td></tr>\`).join('')}</tbody></table>\`}
function consumption(x){const prev=fuelings.filter(p=>p.vehicle_id===x.vehicle_id&&p.fuel_type===x.fuel_type&&p.full_tank&&num(p.odometer)<num(x.odometer)).sort((a,b)=>num(b.odometer)-num(a.odometer));if(!prev)return '—';const km=num(x.odometer)-num(prev.odometer);return km>0?\`\${(km/num(x.quantity)).toFixed(2)} km/\${unit(x.fuel_type)}\`:'—'}
function fuelPage(){const v=activeVehicle();if(!v)return emptyVehicle();return \`<div class="head"><div class="title"><h2>Abastecimentos</h2><p>Registre, edite e acompanhe consumo e custos.</p></div><button class="btn primary" id="newFuel">+ Novo abastecimento</button></div><div class="card table-card">\${fuelTable(v.id)}</div>\`}
function tripsPage(){const v=activeVehicle();if(!v)return emptyVehicle();const arr=trips.filter(x=>x.vehicle_id===v.id);const gross=arr.reduce((a,x)=>a+num(x.gross),0),net=arr.reduce((a,x)=>a+num(x.net),0);return \`<div class="head"><div class="title"><h2>Corridas / Faturamento</h2><p>Controle Uber, 99 e corridas particulares.</p></div><button class="btn primary" id="newTrip">+ Nova corrida</button></div><div class="kpis kpis-4"><div class="card kpi"><small>Bruto total</small><strong>\${money(gross)}</strong><span>\${arr.length} lançamentos</span></div><div class="card kpi accent-green"><small>Líquido total</small><strong>\${money(net)}</strong><span>Após taxas/despesas</span></div><div class="card kpi"><small>Taxas + despesas</small><strong>\${money(gross-net)}</strong><span>Retenções informadas</span></div><div class="card kpi"><small>Corridas</small><strong>\${arr.reduce((a,x)=>a+num(x.trip_count),0)}</strong><span>Quantidade registrada</span></div></div><div class="card table-card"><table><thead><tr><th>Data</th><th>Plataforma</th><th>Bruto</th><th>Taxas</th><th>Outras despesas</th><th>Líquido</th><th>Km</th><th>Horas</th><th>Corridas</th><th>Ações</th></tr></thead><tbody>\${arr.length?arr.map(x=>\`<tr><td>\${dateBR(x.date)}</td><td><span class="tag platform \${platformClass(x.platform)}">\${platformName(x.platform)}</span></td><td><b>\${money(x.gross)}</b></td><td>\${money(x.platform_fee)}</td><td>\${money(x.other_expenses)}</td><td class="positive"><b>\${money(x.net)}</b></td><td>\${num(x.odometer_end)&&num(x.odometer_start)?(num(x.odometer_end)-num(x.odometer_start)).toLocaleString('pt-BR'):'—'}</td><td>\${num(x.hours).toFixed(1)}</td><td>\${num(x.trip_count)}</td><td><div class="actions"><button class="btn secondary" data-edit-trip="\${x.id}">Editar</button><button class="btn danger" data-del-trip="\${x.id}">Excluir</button></div></td></tr>\`).join(''):'<tr><td colspan="10" class="empty">Nenhum lançamento cadastrado.</td></tr>'}</tbody></table></div>\`}
function maintPage(){const v=activeVehicle();if(!v)return emptyVehicle();const arr=maintenances.filter(x=>x.vehicle_id===v.id).sort((a,b)=>b.date.localeCompare(a.date));return \`<div class="head"><div class="title"><h2>Manutenções</h2><p>Histórico, custos e próximas revisões.</p></div><button class="btn primary" id="newMaint">+ Nova manutenção</button></div><div class="card table-card">\${arr.length?\`<table><thead><tr><th>Data</th><th>Serviço</th><th>Categoria</th><th>Hodômetro</th><th>Peças</th><th>Mão de obra</th><th>Total</th><th>Próxima</th><th>Ações</th></tr></thead><tbody>\${arr.map(x=>\`<tr><td>\${dateBR(x.date)}</td><td>\${esc(x.service)}</td><td>\${esc(x.category)}</td><td>\${num(x.odometer).toLocaleString('pt-BR')}</td><td>\${money(x.parts)}</td><td>\${money(x.labor)}</td><td><b>\${money(num(x.parts)+num(x.labor))}</b></td><td>\${x.next_odometer?num(x.next_odometer).toLocaleString('pt-BR')+' km':x.next_date?dateBR(x.next_date):'—'}</td><td><div class="actions"><button class="btn secondary" data-edit-maint="\${x.id}">Editar</button><button class="btn danger" data-del-maint="\${x.id}">Excluir</button></div></td></tr>\`).join('')}</tbody></table>\`:'<div class="empty">Nenhuma manutenção cadastrada.</div>'}</div>\`}
function emptyVehicle(){return \`<div class="card empty">Você ainda não possui veículo cadastrado. Acesse <b>Veículos</b> e clique em “+ Novo veículo”.</div>\`}
function vehiclesPage(){return \`<div class="head"><div class="title"><h2>Veículos</h2><p>Cadastre e gerencie quantos veículos quiser.</p></div><button class="btn primary" id="newVehicle">+ Novo veículo</button></div><div class="vehicle-grid">\${vehicles.length?vehicles.map(v=>\`<div class="card vehicle-card \${v.id===activeVehicleId?'active':''}"><h3>🚗 \${esc(v.brand)} \${esc(v.model)}</h3><p>\${v.year||'—'} \${v.version?'• '+esc(v.version):''}</p><p>Placa: \${esc(v.plate||'—')}</p><p>Hodômetro: \${num(v.odometer).toLocaleString('pt-BR')} km</p>\${v.id===activeVehicleId?'<span class="badge">VEÍCULO ATIVO</span>':''}<div class="vehicle-actions">\${v.id!==activeVehicleId?\`<button class="btn success" data-active="\${v.id}">Selecionar</button>\`:''}<button class="btn secondary" data-edit-vehicle="\${v.id}">Editar</button><button class="btn danger" data-del-vehicle="\${v.id}">Excluir</button></div></div>\`).join(''):'<div class="card empty">Nenhum veículo cadastrado.</div>'}</div>\`}
function dataPage(){return \`<div class="head"><div class="title"><h2>Dados</h2><p>Exportação e segurança dos seus dados.</p></div></div><div class="card data-card"><h3>Backup</h3><p>Baixe uma cópia dos registros do usuário.</p><button class="btn primary" id="backup">Exportar backup JSON</button></div><div class="card data-card"><h3>O que o app controla</h3><div class="feature-grid"><span>🚗 Veículos</span><span>⛽ Gasolina / Álcool / GNV</span><span>📱 Uber / 99 / Particular</span><span>💰 Bruto e líquido</span><span>📊 Indicadores por período</span><span>🔧 Manutenções</span><span>💸 Despesas Diversas</span></div></div>\`}
function modal(content){document.body.insertAdjacentHTML('beforeend',\`<div class="modal-bg show" id="modal"><div class="modal">\${content}</div></div>\`)}
function closeModal(){document.getElementById('modal')?.remove()}

function tripModal(id){const x=id?trips.find(a=>a.id===id):null,v=activeVehicle();modal(\`<h3>\${id?'Editar':'Nova'} corrida / faturamento</h3><p class="modal-help">Registre o valor bruto recebido e as taxas/despesas para o sistema calcular o saldo líquido.</p><div class="form-grid"><div class="field"><label>Data *</label><input id="td" type="date" value="\${x?.date||today()}"></div><div class="field"><label>Plataforma *</label><select id="tp">\${[['uber','Uber'],['99','99'],['particular','Particular']].map(([a,b])=>\`<option value="\${a}" \${x?.platform===a?'selected':''}>\${b}</option>\`).join('')}</select></div><div class="field"><label>Valor bruto (R$) *</label><input id="tg" type="number" step=".01" min="0" value="\${x?.gross??''}"></div><div class="field"><label>Taxa da plataforma (R$)</label><input id="tf" type="number" step=".01" min="0" value="\${x?.platform_fee??0}"></div><div class="field"><label>Outras despesas (R$)</label><input id="toe" type="number" step=".01" min="0" value="\${x?.other_expenses??0}"></div><div class="field"><label>Pagamento</label><select id="tpay"><option value="" \${!x?.payment_type?'selected':''}>Não informado</option><option \${x?.payment_type==='PIX'?'selected':''}>PIX</option><option \${x?.payment_type==='Dinheiro'?'selected':''}>Dinheiro</option><option \${x?.payment_type==='Cartão'?'selected':''}>Cartão</option><option \${x?.payment_type==='App'?'selected':''}>App</option></select></div><div class="field"><label>Hodômetro inicial</label><input id="tstart" type="number" value="\${x?.odometer_start??v?.odometer??''}"></div><div class="field"><label>Hodômetro final</label><input id="tend" type="number" value="\${x?.odometer_end??''}"></div><div class="field"><label>Horas trabalhadas</label><input id="th" type="number" step=".1" min="0" value="\${x?.hours??0}"></div><div class="field"><label>Nº de corridas</label><input id="tc" type="number" min="1" value="\${x?.trip_count??1}"></div><div class="field span2"><label>Observação</label><input id="tn" value="\${esc(x?.note||'')}"></div></div><div class="calc-preview" id="tripPreview">Saldo líquido: \${money(num(x?.gross)-num(x?.platform_fee)-num(x?.other_expenses))}</div><div class="modal-foot"><button class="btn secondary" id="cancel">Cancelar</button><button class="btn primary" id="saveTrip">Salvar</button></div>\`);const preview=()=>{tripPreview.textContent='Saldo líquido: '+money(num(tg.value)-num(tf.value)-num(toe.value));};[tg,tf,toe].forEach(e=>e.addEventListener('input',preview));document.getElementById('saveTrip').onclick=async()=>{const gross=num(tg.value),fee=num(tf.value),other=num(toe.value);if(!td.value||gross<0||fee<0||other<0||num(tc.value)<1)return toast('Preencha os dados da corrida.');const obj={user_id:user.id,vehicle_id:v.id,date:td.value,platform:tp.value,gross,platform_fee:fee,other_expenses:other,odometer_start:num(tstart.value)||null,odometer_end:num(tend.value)||null,hours:num(th.value),trip_count:Math.max(1,parseInt(tc.value||1)),payment_type:tpay.value||null,note:tn.value};const r=id?await supabase.from('driver_trips').update(obj).eq('id',id):await supabase.from('driver_trips').insert(obj);if(r.error)return toast(r.error.message);closeModal();await load();toast('Lançamento salvo.')};document.getElementById('cancel').onclick=closeModal}
function fuelModal(id){const x=id?fuelings.find(a=>a.id===id):null,v=activeVehicle();modal(\`<h3>\${id?'Editar':'Novo'} abastecimento</h3><div class="form-grid"><div class="field"><label>Data *</label><input id="fd" type="date" value="\${x?.date||today()}"></div><div class="field"><label>Tipo *</label><select id="ft">\${[['gas','Gasolina'],['alc','Álcool'],['gnv','GNV']].map(([a,b])=>\`<option value="\${a}" \${x?.fuel_type===a?'selected':''}>\${b}</option>\`).join('')}</select></div><div class="field"><label>Hodômetro (km) *</label><input id="fo" type="number" value="\${x?.odometer??v?.odometer??''}"></div><div class="field"><label>Litros / m³ *</label><input id="fq" type="number" step=".01" min=".01" value="\${x?.quantity??''}"></div><div class="field"><label>Preço por unidade (R$) *</label><input id="fp" type="number" step=".001" min="0" value="\${x?.price_per_unit??''}"></div><div class="field"><label>Posto</label><input id="fs" value="\${esc(x?.station||'')}"></div><div class="field"><label>Tanque cheio?</label><select id="ff"><option value="true" \${x?.full_tank!==false?'selected':''}>Sim</option><option value="false" \${x?.full_tank===false?'selected':''}>Não</option></select></div><div class="field span2"><label>Observação</label><input id="fn" value="\${esc(x?.note||'')}"></div></div><div class="modal-foot"><button class="btn secondary" id="cancel">Cancelar</button><button class="btn primary" id="saveFuel">Salvar</button></div>\`);document.getElementById('saveFuel').onclick=async()=>{const q=num(fq.value),p=num(fp.value),o=num(fo.value);if(!fd.value||o<=0||q<=0||p<0)return toast('Preencha os campos obrigatórios.');const obj={user_id:user.id,vehicle_id:v.id,date:fd.value,odometer:o,fuel_type:ft.value,quantity:q,price_per_unit:p,full_tank:ff.value==='true',station:fs.value,note:fn.value};const r=id?await supabase.from('fuelings').update(obj).eq('id',id):await supabase.from('fuelings').insert(obj);if(r.error)return toast(r.error.message);closeModal();await load();toast('Abastecimento salvo.')};document.getElementById('cancel').onclick=closeModal}
function maintModal(id){const x=id?maintenances.find(a=>a.id===id):null,v=activeVehicle();modal(\`<h3>\${id?'Editar':'Nova'} manutenção</h3><div class="form-grid"><div class="field"><label>Data *</label><input id="md" type="date" value="\${x?.date||today()}"></div><div class="field"><label>Categoria *</label><input id="mc" value="\${esc(x?.category||'Preventiva')}"></div><div class="field"><label>Hodômetro *</label><input id="mo" type="number" value="\${x?.odometer??v?.odometer??''}"></div><div class="field span3"><label>Serviço *</label><input id="ms" value="\${esc(x?.service||'')}"></div><div class="field"><label>Peças (R$)</label><input id="mp" type="number" step=".01" value="\${x?.parts??0}"></div><div class="field"><label>Mão de obra (R$)</label><input id="ml" type="number" step=".01" value="\${x?.labor??0}"></div><div class="field"><label>Próximo km</label><input id="mn" type="number" value="\${x?.next_odometer??''}"></div><div class="field"><label>Próxima data</label><input id="mnd" type="date" value="\${x?.next_date||''}"></div></div><div class="modal-foot"><button class="btn secondary" id="cancel">Cancelar</button><button class="btn primary" id="saveMaint">Salvar</button></div>\`);document.getElementById('saveMaint').onclick=async()=>{if(!md.value||!mo.value||!ms.value)return toast('Preencha data, hodômetro e serviço.');const obj={user_id:user.id,vehicle_id:v.id,date:md.value,odometer:num(mo.value),category:mc.value,service:ms.value,parts:num(mp.value),labor:num(ml.value),next_odometer:num(mn.value)||null,next_date:mnd.value||null};const r=id?await supabase.from('maintenances').update(obj).eq('id',id):await supabase.from('maintenances').insert(obj);if(r.error)return toast(r.error.message);closeModal();await load();toast('Manutenção salva.')};document.getElementById('cancel').onclick=closeModal}
function vehicleModal(id){const x=id?vehicles.find(a=>a.id===id):null;modal(\`<h3>\${id?'Editar':'Novo'} veículo</h3><div class="form-grid"><div class="field"><label>Marca *</label><input id="vb" value="\${esc(x?.brand||'')}"></div><div class="field"><label>Modelo *</label><input id="vm" value="\${esc(x?.model||'')}"></div><div class="field"><label>Ano</label><input id="vy" type="number" value="\${x?.year??''}"></div><div class="field"><label>Versão</label><input id="vv" value="\${esc(x?.version||'')}"></div><div class="field"><label>Placa</label><input id="vp" value="\${esc(x?.plate||'')}"></div><div class="field"><label>Hodômetro</label><input id="vo" type="number" value="\${x?.odometer??0}"></div></div><div class="modal-foot"><button class="btn secondary" id="cancel">Cancelar</button><button class="btn primary" id="saveVehicle">Salvar</button></div>\`);document.getElementById('saveVehicle').onclick=async()=>{if(!vb.value||!vm.value)return toast('Informe marca e modelo.');const obj={user_id:user.id,brand:vb.value,model:vm.value,year:parseInt(vy.value)||null,version:vv.value,plate:vp.value,odometer:num(vo.value),active:id?x.active:vehicles.length===0};const r=id?await supabase.from('vehicles').update(obj).eq('id',id):await supabase.from('vehicles').insert(obj);if(r.error)return toast(r.error.message);closeModal();await load();toast('Veículo salvo.')};document.getElementById('cancel').onclick=closeModal}

function login(){app.innerHTML=\`<div class="login"><div class="login-card"><div class="login-brand">🚗 TBORGES Gestão Inteligente</div><div class="login-sub">Controle online de veículos, combustível, manutenção e renda como motorista.</div><div class="field"><label>E-mail</label><input id="email" type="email" placeholder="seu@email.com"></div><div class="field"><label>Senha</label><input id="pass" type="password" placeholder="Mínimo 6 caracteres"></div><button class="btn primary" id="loginBtn" style="width:100%">Entrar</button><button class="btn secondary" id="signupBtn" style="width:100%;margin-top:8px">Criar conta</button><p id="loginMsg" class="login-msg"></p></div></div>\`;document.getElementById('loginBtn').onclick=async()=>{const r=await supabase.auth.signInWithPassword({email:email.value,password:pass.value});if(r.error)loginMsg.textContent=r.error.message};document.getElementById('signupBtn').onclick=async()=>{const r=await supabase.auth.signUp({email:email.value,password:pass.value});loginMsg.textContent=r.error?r.error.message:'Conta criada. Verifique seu e-mail se a confirmação estiver ativada.'}}

function render(){
 if(!user)return login();
 app.innerHTML=header()+\`<main id="content">\${page==='dashboard'?dashboard():page==='trips'?tripsPage():page==='fuel'?fuelPage():page==='maint'?maintPage():page==='expenses'?expensesPage():page==='vehicles'?vehiclesPage():dataPage()}</main><div class="toast" id="toast"></div>\`;
 
 document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;activeModuleFilter='all';render()});
 document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{activeModuleFilter=b.dataset.filter;render()});
 document.getElementById('logout').onclick=async()=>{await supabase.auth.signOut();user=null;render()};
 const ps=document.getElementById('period');if(ps)ps.onchange=e=>{period=e.target.value;render()};
 const vs=document.getElementById('vehicleSelect');if(vs)vs.onchange=e=>setActive(e.target.value);
 
 document.getElementById('newTrip')?.addEventListener('click',()=>tripModal());
 document.getElementById('newFuel')?.addEventListener('click',()=>fuelModal());
 document.getElementById('newMaint')?.addEventListener('click',()=>maintModal());
 document.getElementById('newVehicle')?.addEventListener('click',()=>vehicleModal());
 document.getElementById('newExpenseBtn')?.addEventListener('click',()=>expenseModal());
 
 document.querySelectorAll('[data-edit-trip]').forEach(b=>b.onclick=()=>tripModal(b.dataset.editTrip));
 document.querySelectorAll('[data-del-trip]').forEach(b=>b.onclick=()=>deleteTrip(b.dataset.delTrip));
 document.querySelectorAll('[data-edit-fuel]').forEach(b=>b.onclick=()=>fuelModal(b.dataset.editFuel));
 document.querySelectorAll('[data-del-fuel]').forEach(b=>b.onclick=()=>deleteFuel(b.dataset.delFuel));
 document.querySelectorAll('[data-edit-maint]').forEach(b=>b.onclick=()=>maintModal(b.dataset.editMaint));
 document.querySelectorAll('[data-del-maint]').forEach(b=>b.onclick=()=>deleteMaint(b.dataset.delMaint));
 document.querySelectorAll('[data-del-exp]').forEach(b=>b.onclick=()=>deleteExpense(b.dataset.delExp));
 document.querySelectorAll('[data-edit-vehicle]').forEach(b=>b.onclick=()=>vehicleModal(b.dataset.editVehicle));
 document.querySelectorAll('[data-del-vehicle]').forEach(b=>b.onclick=()=>deleteVehicle(b.dataset.delVehicle));
 document.querySelectorAll('[data-active]').forEach(b=>b.onclick=()=>setActive(b.dataset.active));
 document.getElementById('backup')?.addEventListener('click',backup);
 if(page==='dashboard')requestAnimationFrame(()=>{drawEarnings();drawProfit();drawPlatformDonut()})
}

async function deleteTrip(id){if(!confirm('Excluir este lançamento?'))return;const r=await supabase.from('driver_trips').delete().eq('id',id);if(r.error)return toast(r.error.message);await load();toast('Lançamento excluído.')}
async function deleteFuel(id){if(!confirm('Excluir este abastecimento?'))return;const r=await supabase.from('fuelings').delete().eq('id',id);if(r.error)return toast(r.error.message);await load();toast('Abastecimento excluído.')}
async function deleteMaint(id){if(!confirm('Excluir esta manutenção?'))return;const r=await supabase.from('maintenances').delete().eq('id',id);if(r.error)return toast(r.error.message);await load();toast('Manutenção excluída.')}
async function deleteExpense(id){if(!confirm('Excluir esta despesa?'))return;const r=await supabase.from('driver_expenses').delete().eq('id',id);if(r.error)return toast(r.error.message);await load();toast('Despesa excluída.')}
async function deleteVehicle(id){if(vehicles.length===1)return toast('Cadastre outro veículo antes de excluir este.');if(!confirm('Excluir o veículo e seus registros?'))return;const r=await supabase.from('vehicles').delete().eq('id',id);if(r.error)return toast(r.error.message);await load();toast('Veículo excluído.')}

function monthKeys(){const[a,b]=range(),keys=[],d=new Date(a.getFullYear(),a.getMonth(),1);while(d<=b){keys.push(\`\${d.getFullYear()}-\${String(d.getMonth()+1).padStart(2,'0')}\`);d.setMonth(d.getMonth()+1)}return keys}
function drawEarnings(){const c=document.getElementById('earningsChart');if(!c)return;const v=activeVehicle(),keys=monthKeys(),data=keys.map(k=>trips.filter(x=>x.vehicle_id===v?.id&&x.date.startsWith(k)).reduce((a,x)=>a+num(x.gross),0));drawBarsCanvas(c,data,keys.map(k=>{const[,m]=k.split('-');return m+'/'+k.slice(2,4)}),'#1677f0','R$')}
function drawProfit(){const c=document.getElementById('profitChart');if(!c)return;const v=activeVehicle(),fuel=vehicleFilter(fuelings,v).reduce((a,x)=>a+num(x.total),0),maint=vehicleFilter(maintenances,v).reduce((a,x)=>a+num(x.parts)+num(x.labor),0),div=vehicleFilter(expenses,v).reduce((a,x)=>a+num(x.amount),0),gross=vehicleFilter(trips,v).reduce((a,x)=>a+num(x.net),0);drawBarsCanvas(c,[gross,fuel+maint+div,Math.max(0,gross-fuel-maint-div)],['Líquido','Custos','Resultado'],['#12a875','#f59b23','#1677f0'])}
function drawBarsCanvas(c,data,labels,color,unitLabel){const ctx=c.getContext('2d'),w=c.clientWidth||600,h=c.clientHeight||250;c.width=w*2;c.height=h*2;ctx.scale(2,2);ctx.clearRect(0,0,w,h);if(!data.length||data.every(x=>!x)){ctx.fillStyle='#718096';ctx.font='13px Arial';ctx.textAlign='center';ctx.fillText('Sem dados para o período',w/2,h/2);return}const max=Math.max(...data,1),gap=Math.min(22,w/(data.length*5)),bw=Math.max(24,(w-45-gap*(data.length+1))/data.length);data.forEach((val,i)=>{const bh=(val/max)*(h-65),x=35+i*(bw+gap),y=h-35-bh;ctx.fillStyle=Array.isArray(color)?color[i]:color;ctx.fillRect(x,y,bw,bh);ctx.fillStyle='#4b5d73';ctx.font='10px Arial';ctx.textAlign='center';ctx.fillText(labels[i],x+bw/2,h-15);ctx.fillStyle='#16253d';ctx.font='10px Arial';ctx.fillText(money(val),x+bw/2,Math.max(12,y-5))})}
function drawPlatformDonut(){const e=document.getElementById('platformDonut'),v=activeVehicle();if(!e)return;const tr=vehicleFilter(trips,v),vals={uber:0,'99':0,particular:0};tr.forEach(x=>vals[x.platform]+=num(x.gross));const total=Object.values(vals).reduce((a,b)=>a+b,0),u=total?vals.uber/total*100:0,n=total?(vals.uber+vals['99'])/total*100:0;e.style.background=\`conic-gradient(#111827 0 \${u}%,#1677f0 \Structural syntax evaluation generated error: unescaped char single quotes in string sequence.
