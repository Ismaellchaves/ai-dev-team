const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const limit=(value,min,max,fallback)=>Math.min(max,Math.max(min,Number(value)||fallback));

const categoryRules=[
  {label:'Barbearias',terms:['barbearia','barbearias','barber'],tags:[['shop','hairdresser']]},
  {label:'Restaurantes',terms:['restaurante','restaurantes'],tags:[['amenity','restaurant']]},
  {label:'Clínicas odontológicas',terms:['clinica odontologica','clinicas odontologicas','dentista','dentistas','consultorio odontologico'],tags:[['amenity','dentist']]},
  {label:'Oficinas mecânicas',terms:['oficina mecanica','oficinas mecanicas','mecanico','mecanica automotiva'],tags:[['shop','car_repair'],['craft','car_repair']]},
  {label:'Academias',terms:['academia','academias','academia de ginastica','gym'],tags:[['leisure','fitness_centre']]},
  {label:'Lojas de informática',terms:['loja de informatica','lojas de informatica','informatica','computer shop'],tags:[['shop','computer']]},
  {label:'Imobiliárias',terms:['imobiliaria','imobiliarias','corretor de imoveis'],tags:[['office','estate_agent']]},
  {label:'Mercados',terms:['mercado','mercados','supermercado','supermercados'],tags:[['shop','supermarket'],['shop','convenience']]},
  {label:'Salões de beleza',terms:['salao de beleza','saloes de beleza','salao','saloes','cabeleireiro','cabeleireiros'],tags:[['shop','hairdresser'],['shop','beauty']]},
  {label:'Farmácias',terms:['farmacia','farmacias','drogaria','drogarias'],tags:[['amenity','pharmacy']]},
  {label:'Hotéis',terms:['hotel','hoteis','pousada','pousadas'],tags:[['tourism','hotel'],['tourism','guest_house']]},
  {label:'Cafés',terms:['cafe','cafes','cafeteria','cafeterias'],tags:[['amenity','cafe']]},
  {label:'Padarias',terms:['padaria','padarias','bakery'],tags:[['shop','bakery']]},
  {label:'Pet shops',terms:['pet shop','pet shops','loja de animais'],tags:[['shop','pet']]},
  {label:'Escritórios de advocacia',terms:['advocacia','advogado','advogados','escritorio de advocacia'],tags:[['office','lawyer']]},
  {label:'Agências de turismo',terms:['agencia de turismo','agencias de turismo'],tags:[['shop','travel_agency']]},
  {label:'Lojas de roupas',terms:['loja de roupa','lojas de roupas','vestuario'],tags:[['shop','clothes']]},
  {label:'Lojas de móveis',terms:['loja de moveis','lojas de moveis','moveis'],tags:[['shop','furniture']]},
  {label:'Postos de combustível',terms:['posto de combustivel','postos de combustivel','posto de gasolina'],tags:[['amenity','fuel']]},
  {label:'Veterinários',terms:['veterinario','veterinarios','clinica veterinaria'],tags:[['amenity','veterinary']]},
  {label:'Escolas',terms:['escola','escolas','colegio','colegios'],tags:[['amenity','school']]},
  {label:'Igrejas',terms:['igreja','igrejas'],tags:[['amenity','place_of_worship']]},
  {label:'Lojas de eletrônicos',terms:['loja de eletronicos','lojas de eletronicos','eletronicos'],tags:[['shop','electronics']]},
  {label:'Lojas de materiais de construção',terms:['material de construcao','materiais de construcao','loja de construcao'],tags:[['shop','hardware']]},
  {label:'Floriculturas',terms:['floricultura','floriculturas','florist','flower shop'],tags:[['shop','florist']]}
];
const directTagValues=new Map([['bar',['amenity','bar']],['pub',['amenity','pub']],['cinema',['amenity','cinema']],['livraria',['shop','books']],['bookstore',['shop','books']],['bicicletaria',['shop','bicycle']],['lavanderia',['shop','laundry']],['joalheria',['shop','jewelry']],['florist',['shop','florist']]]);

export function categoryFor(value){
  const normalized=fold(value);
  const explicit=normalized.match(/^(amenity|shop|office|craft|tourism|leisure|healthcare|historic|industrial)=([a-z0-9_:-]+)$/);
  if(explicit)return{label:String(value).trim(),tags:[[explicit[1],explicit[2]]]};
  if(directTagValues.has(normalized))return{label:String(value).trim(),tags:[directTagValues.get(normalized)]};
  const found=categoryRules.find(rule=>rule.terms.includes(normalized)||rule.terms.some(term=>normalized.includes(term)));
  if(found)return{label:found.label,tags:found.tags};
  return null;
}

export function parseProspectingIntent(input={}){
  const query=String(input.query??'').trim().slice(0,1000),folded=fold(query);
  const selectedCategories=Array.isArray(input.categories)?input.categories.map(value=>String(value??'').trim()).filter(Boolean).slice(0,12):[];
  let category=String(input.category??'').trim().slice(0,300),region=String(input.region??'').trim().slice(0,180),radius=Number(input.radius_km)||null;
  if(selectedCategories.length)category=selectedCategories.join(', ');
  const radiusMatch=query.match(/raio\s*(?:de)?\s*(\d{1,3})\s*km\s*(?:de|a partir de)\s*(.+?)(?:[.!?]|$)/iu);
  if(!category){
    const known=categoryRules.find(rule=>rule.terms.some(term=>folded.includes(term)));
    if(known)category=known.label;
  }
  if(!category){
    const start=folded.match(/\b(?:encontre|busque|pesquise|procure|localize|ache)\s+(?:para mim\s+)?(.+?)(?=\s+\b(?:em|no|na)\s+(?:um\s+)?raio\b|\s+\b(?:em|no|na)\s+(?:todo\s+|toda\s+|todo o\s+|toda a\s+)?[\p{L}])/u);
    if(start)category=start[1].replace(/\b(?:empresas|negocios|estabelecimentos)\s+de\s+/,'').trim();
  }
  if(!category){const rule=categoryRules.find(item=>item.terms.some(term=>folded.includes(term)));if(rule)category=rule.label;}
  if(radiusMatch){radius=radius||Number(radiusMatch[1]);if(!region)region=radiusMatch[2].trim();}
  if(!region){
    const match=query.match(/\b(?:em|no|na)\s+(?:todo\s+o\s+|toda\s+|todo\s+|estado de\s+|cidade de\s+)?([\p{L}][\p{L}\s,'-]{1,120}?)(?:\s+e\s+liste|\s+e\s+priorize|\s+e\s+com|[.!?]|$)/iu);
    if(match)region=match[1].trim().replace(/\s+(?:em um raio|num raio).*$/i,'');
  }
  const maxMatch=folded.match(/(?:ate|no maximo|maximo de|limite de)\s*(\d{1,4})\s*(?:resultados?|empresas?)?/);
  const maxResults=limit(input.max_results||maxMatch?.[1],1,500,100);
  const maxSegments=limit(input.max_segments,1,64,24);
  const missing=[];if(!category)missing.push('category');if(!region)missing.push('region');
  const categories=selectedCategories.length?selectedCategories:(category?[category]:[]),categorySpecs=categories.map(categoryFor),categorySpec=categorySpecs.length&&categorySpecs.every(Boolean)?{label:categories.join(', '),tags:[...new Map(categorySpecs.flatMap(spec=>spec.tags).map(tag=>[tag.join('='),tag])).values()]}:null;
  const siteOnly=Boolean(input.site_only)||/(?:com|que tenham|possuem)\s+(?:site|website)/i.test(query);return{query,category,region,radius_km:radius&&radius>0?Math.min(200,Math.round(radius)):null,max_results:maxResults,max_segments:maxSegments,category_spec:categorySpec,site_only:siteOnly,missing,unsupported_category:Boolean(categories.length&&!categorySpec)};
}

export function deduplicateOsmElements(elements=[]){
  const seen=new Set(),unique=[];
  for(const element of elements){const key=`${element.type}:${element.id}`;if(!element?.id||seen.has(key))continue;seen.add(key);unique.push(element)}
  return unique;
}

export function splitBoundingBox(bbox,maxSegments=24,cellKm=180){
  if(!Array.isArray(bbox)||bbox.length!==4)throw new Error('A fonte não retornou os limites geográficos dessa região.');
  const [south,north,west,east]=bbox.map(Number);
  if(![south,north,west,east].every(Number.isFinite)||south>=north||west>=east)throw new Error('A fonte retornou limites geográficos inválidos.');
  const latKm=(north-south)*111.32,mid=(south+north)/2,lonKm=(east-west)*111.32*Math.max(0.15,Math.cos(mid*Math.PI/180));
  const rows=Math.max(1,Math.ceil(latKm/cellKm)),cols=Math.max(1,Math.ceil(lonKm/cellKm)),count=rows*cols;
  if(count>maxSegments){const error=new Error(`Essa área exige ${count} segmentos, acima do limite configurado de ${maxSegments}. Escolha uma região menor ou aumente o limite de segmentos (máximo 64).`);error.code='region_too_large';throw error;}
  const cells=[];for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)cells.push({south:south+(north-south)*row/rows,north:south+(north-south)*(row+1)/rows,west:west+(east-west)*col/cols,east:west+(east-west)*(col+1)/cols});
  return cells;
}

function overpassFilter(tags){return tags.map(([key,value])=>`["${key}"="${value}"]`).join('');}
export function buildOverpassQuery({location,cells,radiusKm,center,tags,maxResults}){
  if(!Array.isArray(tags)||!tags.length)throw new Error('Escolha uma categoria OSM válida.');
  const selectors=radiusKm
    ? tags.map(([key,value])=>`nwr(around:${Math.round(radiusKm*1000)},${Number(center.lat)},${Number(center.lon)})${overpassFilter([[key,value]])};`)
    : cells.flatMap(cell=>tags.map(([key,value])=>`nwr(area.searchArea)(${cell.south},${cell.west},${cell.north},${cell.east})${overpassFilter([[key,value]])};`));
  const sourceType=location?.osm_type==='way'?'way':'rel',areaSetup=radiusKm?'':`${sourceType}(${Number(location?.osm_id)})->.boundary;map_to_area.boundary->.searchArea;`;
  return`[out:json][timeout:30][maxsize:67108864];${areaSetup}(${selectors.join('')});out center tags ${Math.min(1000,Math.max(1,Math.floor(maxResults)+1))};`;
}

const cleanTag=value=>String(value??'').trim();
export function normalizeOsmElement(element){
  const tags=element.tags||{},center=element.center||element;
  const latitude=Number(center.lat),longitude=Number(center.lon),street=tags['addr:street'],number=tags['addr:housenumber'];
  const address=[street&&[street,number].filter(Boolean).join(', '),tags['addr:suburb'],tags['addr:city'],tags['addr:state'],tags['addr:postcode']].filter(Boolean).join(' · ');
  const website=tags.website||tags['contact:website']||'';
  return{id:`osm:${element.type}:${element.id}`,osm_type:element.type,osm_id:String(element.id),name:cleanTag(tags.name||tags.brand||'Sem nome cadastrado no OpenStreetMap'),category:cleanTag(tags.shop||tags.amenity||tags.office||tags.craft||tags.leisure||tags.tourism||tags.healthcare||''),address,latitude:Number.isFinite(latitude)?latitude:null,longitude:Number.isFinite(longitude)?longitude:null,phone:cleanTag(tags.phone||tags['contact:phone']||''),website:cleanTag(website),opening_hours:cleanTag(tags.opening_hours||''),osm_url:`https://www.openstreetmap.org/${element.type}/${element.id}`,tags};
}

export function buildProspectingCsv(results=[],{searchedAt=''}={}){
  const quote=value=>'"'+String(value??'').replaceAll('"','""')+'"';
  const safe=value=>{const text=String(value??'');return quote(/^[=+@\-\t\r]/.test(text)?`'${text}`:text)};
  const columns=['ID OSM','Tipo','Nome','Categoria','Endereço','Latitude','Longitude','Telefone','Site','Horário','URL OpenStreetMap','Data da pesquisa'];
  return '\ufeff'+['Fonte: OpenStreetMap contributors · Licença: ODbL 1.0',columns.map(safe).join(','),...results.map(place=>[place.osm_id,place.osm_type,place.name,place.category,place.address,place.latitude,place.longitude,place.phone,place.website,place.opening_hours,place.osm_url,searchedAt].map(safe).join(','))].join('\r\n');
}

let lastGeocodeRequest=0;
const geocodeCache=new Map();
const osmType=value=>({r:'relation',w:'way',n:'node',relation:'relation',way:'way',node:'node'})[String(value||'').toLowerCase()]||null;
function geoapifyBounds(value){
  if(Array.isArray(value)&&value.length===4){const [west,south,east,north]=value.map(Number);return [south,north,west,east].every(Number.isFinite)?[south,north,west,east]:null}
  if(value&&typeof value==='object'){const west=Number(value.lon1??value.west),south=Number(value.lat1??value.south),east=Number(value.lon2??value.east),north=Number(value.lat2??value.north);return [south,north,west,east].every(Number.isFinite)?[south,north,west,east]:null}
  return null;
}
async function geocodeRegion(region,{signal,fetchImpl,nominatimUrl,geoapifyUrl,geoapifyApiKey,userAgent}){
  const geocoder=geoapifyApiKey?'geoapify':'nominatim',key=geocoder+':'+fold(region);if(geocodeCache.has(key))return geocodeCache.get(key);
  const wait=Math.max(0,1000-(Date.now()-lastGeocodeRequest));if(wait)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,wait);signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'))},{once:true})});
  lastGeocodeRequest=Date.now();let url,payload;
  if(geoapifyApiKey){
    url=new URL(geoapifyUrl);url.searchParams.set('text',region);url.searchParams.set('format','json');url.searchParams.set('lang','pt');url.searchParams.set('limit','5');url.searchParams.set('apiKey',geoapifyApiKey);
    const response=await fetchImpl(url,{signal,headers:{accept:'application/json'}});
    if(!response.ok){if(response.status===401||response.status===403)throw new Error('A chave Geoapify recusou a chave ou ela nao tem acesso a Geocoding API. Confira PIXEL_GEOAPIFY_API_KEY.');if(response.status===429)throw new Error('O limite de consultas Geoapify foi atingido. Aguarde ou confira a cota da sua conta.');throw new Error('Falha na consulta Geoapify de localizacao (HTTP '+response.status+').')}
    try{payload=await response.json()}catch{throw new Error('Geoapify retornou uma resposta inv?lida.')}
    const chosen=(payload.results||payload.features||[])[0];if(!chosen)throw new Error('Localiza??o n?o encontrada. Tente escolher uma op??o ou informar cidade e estado.');
    const raw=chosen.datasource?.raw||chosen.properties?.datasource?.raw||{},properties=chosen.properties||chosen,bbox=geoapifyBounds(properties.bbox||chosen.bbox),type=osmType(raw.osm_type);
    const parsed={lat:Number(properties.lat??chosen.lat),lon:Number(properties.lon??chosen.lon),bbox,osm_type:type||'node',osm_id:Number(raw.osm_id)||null,display_name:properties.formatted||properties.address_line1||properties.name||region,osm_name:properties.name||properties.city||properties.state||region,category:properties.category,type:properties.result_type||properties.type,place_id:properties.place_id,geocoder};
    if(!Number.isFinite(parsed.lat)||!Number.isFinite(parsed.lon))throw new Error('Geoapify nao retornou coordenadas validas para essa localizacao.');
    geocodeCache.set(key,parsed);return parsed;
  }
  url=new URL(nominatimUrl);url.searchParams.set('q',region);url.searchParams.set('format','jsonv2');url.searchParams.set('limit','5');url.searchParams.set('addressdetails','1');
  const response=await fetchImpl(url,{signal,headers:{accept:'application/json','user-agent':userAgent}});
  if(!response.ok){if(response.status===429||response.status===503)throw new Error('O servi?o p?blico de localiza??o est? sobrecarregado. Aguarde alguns minutos e tente novamente.');throw new Error('A consulta de localiza??o falhou (HTTP '+response.status+').')}
  try{payload=await response.json()}catch{throw new Error('O geocodificador retornou uma resposta inv?lida.')}
  if(!Array.isArray(payload)||!payload.length)throw new Error('Localiza??o n?o encontrada. Tente informar cidade e estado.');
  const chosen=payload[0],bbox=chosen.boundingbox?.map(Number);if(!bbox||bbox.length!==4)throw new Error('A localiza??o encontrada n?o possui limites geogr?ficos utiliz?veis.');
  const parsed={lat:Number(chosen.lat),lon:Number(chosen.lon),bbox,osm_type:osmType(chosen.osm_type),osm_id:Number(chosen.osm_id)||null,display_name:chosen.display_name,osm_name:chosen.name,category:chosen.category,type:chosen.type,geocoder};
  if(!Number.isFinite(parsed.lat)||!Number.isFinite(parsed.lon))throw new Error('A localiza??o retornou coordenadas inv?lidas.');
  geocodeCache.set(key,parsed);return parsed;
}

export class OverpassProvider{
  constructor(config={}){this.id='overpass';this.name='OpenStreetMap / Overpass';this.overpassUrl=config.overpassUrl||'https://overpass-api.de/api/interpreter';this.nominatimUrl=config.nominatimUrl||'https://nominatim.openstreetmap.org/search';this.geoapifyUrl=config.geoapifyUrl||'https://api.geoapify.com/v1/geocode/search';this.geoapifyApiKey=config.geoapifyApiKey||'';this.userAgent=config.userAgent||'PIXEL-AI-STUDIO/0.2 (user-initiated OSM prospecting)';this.geocoderName=this.geoapifyApiKey?'Geoapify':'Nominatim';this.geocoderReady=Boolean(this.geoapifyApiKey);this.tileUrl=config.tileUrl||'https://tile.openstreetmap.org/{z}/{x}/{y}.png';this.cellKm=Number(config.cellKm)||180;this.maxSegments=Math.min(64,Math.max(1,Number(config.maxSegments)||24));this.fetchImpl=config.fetchImpl||fetch;}
  async search(search,{signal,onProgress=()=>{}}={}){
    onProgress('Localizando a regiao com '+this.geocoderName);
    let location=await geocodeRegion(search.region,{signal,fetchImpl:this.fetchImpl,nominatimUrl:this.nominatimUrl,geoapifyUrl:this.geoapifyUrl,geoapifyApiKey:this.geoapifyApiKey,userAgent:configUserAgent(this)});
    if(!search.radius_km&&(location.osm_type==='node'||!location.osm_id||!location.bbox)){
      onProgress('Localizando o limite administrativo da regi?o');
      const safeName=String(location.osm_name||search.region).replaceAll('\\','\\\\').replaceAll('"','\\"');
      const boundaryQuery=location.osm_type==='relation'&&location.osm_id?`[out:json][timeout:15];rel(${location.osm_id});out geom;`:`[out:json][timeout:15];rel(around:5000,${location.lat},${location.lon})["boundary"="administrative"]["name"="${safeName}"];out geom;`;
      const boundaryResponse=await this.fetchImpl(this.overpassUrl,{method:'POST',signal,headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','accept':'application/json','user-agent':'PIXEL-AI-STUDIO/0.2 (user-initiated OSM prospecting)'},body:new URLSearchParams({data:boundaryQuery})});
      if(!boundaryResponse.ok)throw new Error(boundaryResponse.status===429||boundaryResponse.status===503||boundaryResponse.status===504?'Overpass est? sobrecarregado ao localizar o limite. Informe um raio ou tente novamente mais tarde.':'A consulta do limite geogr?fico falhou (HTTP '+boundaryResponse.status+').');
      const boundaryData=await boundaryResponse.json(),relation=(boundaryData.elements||[]).filter(item=>item.type==='relation').sort((a,b)=>Number(a.tags?.admin_level||99)-Number(b.tags?.admin_level||99))[0];
      if(!relation)throw new Error('O OpenStreetMap nao forneceu o limite dessa regiao. Informe um raio para continuar.');
      const points=(relation.members||[]).flatMap(member=>member.geometry||[]),latitudes=points.map(point=>Number(point.lat)).filter(Number.isFinite),longitudes=points.map(point=>Number(point.lon)).filter(Number.isFinite),bounds=location.bbox||([latitudes.length&&longitudes.length?[Math.min(...latitudes),Math.max(...latitudes),Math.min(...longitudes),Math.max(...longitudes)]:null][0]);
      location={...location,osm_type:'relation',osm_id:Number(relation.id),bbox:bounds,display_name:relation.tags?.name||location.display_name};
    }
    if(!search.radius_km&&(!location.bbox||!['relation','way'].includes(location.osm_type)||!location.osm_id))throw new Error('Geoapify encontrou o local, mas o limite OSM nao esta disponivel. Escolha um raio ou outra regiao.');
    const bounds=search.radius_km?null:location.bbox,center={lat:location.lat,lon:location.lon};
    const cells=search.radius_km?[]:splitBoundingBox(bounds,Math.min(this.maxSegments,search.max_segments),this.cellKm);
    const query=buildOverpassQuery({location,cells,radiusKm:search.radius_km,center,tags:search.category_spec.tags,maxResults:search.max_results});
    onProgress('Consultando Overpass em '+(search.radius_km?'um raio de '+search.radius_km+' km':cells.length+' ?rea(s) delimitada(s)'));
    const response=await this.fetchImpl(this.overpassUrl,{method:'POST',signal,headers:{'content-type':'application/x-www-form-urlencoded;charset=UTF-8','accept':'application/json','user-agent':'PIXEL-AI-STUDIO/0.2 (user-initiated OSM prospecting)'},body:new URLSearchParams({data:query})});
    if(!response.ok){if(response.status===429||response.status===504||response.status===503)throw new Error('Overpass est? sobrecarregado ou atingiu o limite de recursos. Aguarde e tente uma regi?o menor.');throw new Error('Overpass respondeu com erro HTTP '+response.status+'.')}
    let payload;try{payload=await response.json()}catch{throw new Error('Overpass retornou uma resposta inv?lida. Tente novamente mais tarde.')}
    if(payload.remark)throw new Error('Overpass n?o concluiu a consulta: '+String(payload.remark).slice(0,240)+'. Reduza a regi?o ou tente mais tarde.');
    onProgress('Deduplicando identificadores OSM');
    const unique=deduplicateOsmElements(payload.elements||[]),websiteFiltered=search.site_only?unique.filter(element=>element.tags?.website||element.tags?.['contact:website']):unique,elements=websiteFiltered.slice(0,search.max_results),results=elements.map(normalizeOsmElement);
    const metadata={provider:this.id,provider_name:this.name,geocoder:location.geocoder,geocoder_name:this.geocoderName,source_url:this.overpassUrl,geocoder_url:this.geoapifyApiKey?this.geoapifyUrl:this.nominatimUrl,license:'ODbL',attribution:'\u00a9 OpenStreetMap contributors',location_name:location.display_name,location_type:location.type,location_osm_type:location.osm_type,location_osm_id:location.osm_id,center,bounds,radius_km:search.radius_km,segments:cells.length,requested_max:search.max_results,truncated:(payload.elements||[]).length>results.length||results.length>=search.max_results,returned_raw:(payload.elements||[]).length,unique_count:results.length,analyzed_count:results.length,qualified_count:0,qualification_note:'A busca encontrou registros OSM. Qualificacao comercial ainda nao executada; ausencia de site nao prova que a empresa nao tenha site.',site_filter:search.site_only?'Somente registros com tag de site no OSM':'Nenhum'};
    onProgress('Consulta concluida: '+results.length+' registros OSM unicos recebidos');return{results,metadata};
  }
}
function configUserAgent(provider){return provider.userAgent||'PIXEL-AI-STUDIO/0.2 (user-initiated OSM prospecting)'}

export const prospectingProviders={overpass:config=>new OverpassProvider(config)};
