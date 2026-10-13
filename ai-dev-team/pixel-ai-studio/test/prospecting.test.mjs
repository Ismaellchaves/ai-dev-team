import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOverpassQuery,categoryFor,deduplicateOsmElements,normalizeOsmElement,OverpassProvider,parseProspectingIntent,splitBoundingBox} from '../src/prospecting.mjs';

test('interpreta nichos, regiões, raio, site e limites em linguagem natural',()=>{
  const examples=[
    ['Encontre barbearias em um raio de 30 km de Crateús, Ceará.','Barbearias','Crateús, Ceará',30],
    ['Busque restaurantes em Crateús.','Restaurantes','Crateús',null],
    ['Encontre clínicas odontológicas em todo o Ceará.','Clínicas odontológicas','Ceará',null],
    ['Pesquise oficinas mecânicas no estado de São Paulo.','Oficinas mecânicas','São Paulo',null],
    ['Encontre academias em Portugal.','Academias','Portugal',null],
    ['Busque lojas de informática em um raio de 50 km de Fortaleza.','Lojas de informática','Fortaleza',50],
    ['Procure imobiliárias em todo o Brasil.','Imobiliárias','Brasil',null],
    ['Pesquise salões de beleza em Crateús e liste os estabelecimentos com site disponível.','Salões de beleza','Crateús',null]
  ];
  for(const [query,category,region,radius] of examples){const parsed=parseProspectingIntent({query});assert.equal(parsed.category,category);assert.equal(parsed.region,region);assert.equal(parsed.radius_km,radius);assert.deepEqual(parsed.missing,[])}
  assert.equal(parseProspectingIntent({query:examples[7][0]}).site_only,true);
  assert.deepEqual(categoryFor('shop=florist').tags,[['shop','florist']]);
  assert.equal(parseProspectingIntent({query:'Encontre negócios especiais em Recife'}).unsupported_category,true);
});

test('separa limites geográficos em segmentos completos e recusa excesso configurável',()=>{
  const cells=splitBoundingBox([-6,-4,-42,-40],24,70);assert.ok(cells.length>1);assert.ok(cells.every(c=>c.south>=-6&&c.north<=-4&&c.west>=-42&&c.east<=-40));
  assert.throws(()=>splitBoundingBox([-35,35,-74,-34],12,180),error=>error.code==='region_too_large'&&/segmentos/.test(error.message));
});

test('constrói consultas Overpass tipadas por área ou raio sem editar dados OSM',()=>{
  const area=buildOverpassQuery({location:{osm_type:'relation',osm_id:10},cells:[{south:-6,west:-42,north:-5,east:-41}],tags:[['shop','hairdresser']],maxResults:50});
  assert.match(area,/rel\(10\).*map_to_area/);assert.match(area,/nwr\(area\.searchArea\)/);assert.match(area,/\["shop"="hairdresser"\]/);assert.match(area,/out center tags 51/);assert.doesNotMatch(area,/api\/0\.6\/changeset|\/create/);
  const radius=buildOverpassQuery({location:{osm_type:'node',osm_id:1},cells:[],radiusKm:30,center:{lat:-5.2,lon:-40.7},tags:[['amenity','restaurant']],maxResults:10});assert.match(radius,/around:30000,-5\.2,-40\.7/);assert.doesNotMatch(radius,/map_to_area/);
});

test('deduplica somente o mesmo tipo e ID e não preenche campos ausentes',()=>{
  const unique=deduplicateOsmElements([{type:'node',id:7},{type:'node',id:7},{type:'way',id:7}]);assert.equal(unique.length,2);
  const place=normalizeOsmElement({type:'node',id:8,lat:1,lon:2,tags:{shop:'books',name:'Livraria'}});assert.equal(place.id,'osm:node:8');assert.equal(place.name,'Livraria');assert.equal(place.phone,'');assert.equal(place.website,'');assert.equal(place.address,'');
});

const geocode=[{lat:'-5.18',lon:'-40.67',boundingbox:['-5.19','-5.17','-40.68','-40.66'],osm_type:'relation',osm_id:9201,display_name:'Crateús, Brasil',name:'Crateús',type:'administrative'}];
test('provedor Overpass usa geocodificação e consulta reais por POST, com dados retornados',async()=>{
  const calls=[];const fetchImpl=async(url,options)=>{calls.push({url:String(url),options});if(String(url).includes('/search'))return new Response(JSON.stringify(geocode),{status:200,headers:{'content-type':'application/json'}});return new Response(JSON.stringify({elements:[{type:'node',id:101,lat:-5.18,lon:-40.67,tags:{shop:'hairdresser',name:'Barbearia Real'}}]}),{status:200,headers:{'content-type':'application/json'}})};
  const provider=new OverpassProvider({fetchImpl,overpassUrl:'https://overpass.test/interpreter',nominatimUrl:'https://nominatim.test/search'}),phases=[];
  const parsed=parseProspectingIntent({query:'Pesquise barbearias em Crateús'}),result=await provider.search(parsed,{onProgress:p=>phases.push(p)});
  assert.equal(calls.length,2);assert.equal(calls[0].options.headers['user-agent'],provider.userAgent);assert.equal(calls[1].options.method,'POST');assert.equal(result.results[0].name,'Barbearia Real');assert.equal(result.metadata.provider,'overpass');assert.equal(result.metadata.license,'ODbL');assert.ok(phases.some(p=>p.includes('Overpass')));
});

test('usa Geoapify no servidor sem expor a chave nos metadados e aceita varios nichos',async()=>{
  const calls=[],fixture={results:[{lat:-5.18,lon:-40.67,bbox:[-40.70,-5.20,-40.65,-5.15],formatted:'Crateus, Ceara, Brasil',name:'Crateus',result_type:'city',place_id:'fixture-place',datasource:{raw:{osm_type:'r',osm_id:9201}}}]};
  const fetchImpl=async(url,options)=>{calls.push({url:new URL(String(url)),options});if(String(url).includes('/geocode/search'))return new Response(JSON.stringify(fixture),{status:200,headers:{'content-type':'application/json'}});return new Response(JSON.stringify({elements:[]}),{status:200,headers:{'content-type':'application/json'}})};
  const provider=new OverpassProvider({fetchImpl,geoapifyUrl:'https://geoapify.test/v1/geocode/search',geoapifyApiKey:'fixture-secret',overpassUrl:'https://overpass.test/interpreter'});
  const parsed=parseProspectingIntent({categories:['Restaurantes','Barbearias'],region:'Crateus'});assert.equal(parsed.category_spec.tags.length,2);
  const result=await provider.search(parsed);assert.equal(provider.geocoderName,'Geoapify');assert.equal(calls[0].url.searchParams.get('text'),'Crateus');assert.equal(calls[0].url.searchParams.get('apiKey'),'fixture-secret');assert.equal(result.metadata.geocoder_name,'Geoapify');assert.equal(JSON.stringify(result.metadata).includes('fixture-secret'),false);assert.match(new URLSearchParams(calls[1].options.body).get('data'),/amenity.*restaurant/);assert.match(new URLSearchParams(calls[1].options.body).get('data'),/shop.*hairdresser/);
});

test('relata indisponibilidade e permite cancelar requisição Overpass',async()=>{
  const failing=new OverpassProvider({fetchImpl:async url=>String(url).includes('/search')?new Response(JSON.stringify(geocode),{status:200}):new Response('busy',{status:429}),overpassUrl:'https://overpass.test/interpreter',nominatimUrl:'https://nominatim.test/search'});
  await assert.rejects(()=>failing.search(parseProspectingIntent({query:'Restaurantes em Crateús'})),/sobrecarregado/);
  const fetchImpl=async(url,options)=>{if(String(url).includes('/search'))return new Response(JSON.stringify(geocode),{status:200});return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('Canceled','AbortError')),{once:true}))};
  const cancellable=new OverpassProvider({fetchImpl,overpassUrl:'https://overpass.test/interpreter',nominatimUrl:'https://nominatim.test/search'}),controller=new AbortController(),running=cancellable.search(parseProspectingIntent({query:'Restaurantes em Crateús'}),{signal:controller.signal});
  setTimeout(()=>controller.abort(),10);await assert.rejects(running,error=>error.name==='AbortError');
});
