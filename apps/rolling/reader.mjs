import {createPublicReader} from './reader-client.mjs';
import {safeURL} from './model.mjs';
import {focusRoute,skipToContent} from './navigation.mjs';

const read=createPublicReader(),app=document.querySelector('#app'),positions=new Map();
let controller,sequence=0,route=location.hash.slice(1)||'/home',main;
const narrow=matchMedia('(max-width:700px)');
const el=(tag,attrs={},...children)=>{
 const node=document.createElement(tag);for(const [key,value]of Object.entries(attrs)){
  if(key.startsWith('on'))node.addEventListener(key.slice(2).toLowerCase(),value);
  else if(value!==null&&value!==undefined)node.setAttribute(key,String(value));
 }
 for(const child of children.flat(Infinity))if(child!==null&&child!==undefined)node.append(child instanceof Node?child:document.createTextNode(String(child)));
 return node;
};
const link=(label,to,attrs={})=>el('a',{href:'#'+to,...attrs},label);
const button=(label,action,attrs={})=>el('button',{type:'button',class:'button',onClick:action,...attrs},label);
const text=value=>typeof value==='string'?value:'';
const field=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,76})$/.test(value);
const announce=message=>{document.querySelector('#announcement').textContent=message;};
function richText(value){
 const node=el('div',{class:'post-body'}),source=text(value),pattern=/\[([^\]]+)\]\(([^\s)]+)\)|(https?:\/\/[^\s]+)/g;let end=0;
 for(const match of source.matchAll(pattern)){
  node.append(document.createTextNode(source.slice(end,match.index)));const url=safeURL(match[2]||match[3]);
  node.append(url?el('a',{href:url,target:'_blank',rel:'noopener noreferrer'},match[1]||match[3]):document.createTextNode(match[0]));end=match.index+match[0].length;
 }node.append(document.createTextNode(source.slice(end)));return node;
}
function postCard(post,data){
 if(!post||!field(post.id)||!post.record||!field(post.record.root))throw Error('Invalid public post');
 const r=post.record,named=data.names?.[r.name_id],board=data.boards?.[r.subboard],isBot=Boolean(post.bot);
 const author=isBot?'Bok':r.name_id==='0'?'Anonymous':named?`${text(named.first)} ${text(named.last)}`:'Registered name';
 const article=el('article',{class:'post',id:'post-'+post.id,'aria-label':'Post by '+author});
 const who=isBot||r.name_id==='0'?el('span',{class:'author'},author):link(author,'/profile/'+r.name_id,{class:'author'});
 article.append(el('div',{class:'post-top'},el('span',{class:'avatar '+(isBot?'bot':'anonymous'),'aria-hidden':'true'},isBot?'B':'◌'),el('div',{},who,isBot?el('span',{class:'bot-badge'},'Authenticated bot'):null,el('div',{class:'post-context'},board?text(board.name):'Main board',' · ',timestamp(post.timestamp)))));
 if(post.text===null){article.append(el('p',{class:'removed'},'This post is unavailable under the board’s moderation policy. ',link('View thread','/thread/'+r.root)));return article;}
 if(r.parent!=='0')article.append(el('p',{class:'reply-line'},'In reply to ',link('an earlier post','/thread/'+r.root+'/'+r.parent)));
 if(r.reference!=='0')article.append(el('p',{class:'reply-line'},r.kind==='3'?'Reposted from ':'Quoted from ',link('the original post','/post/'+r.reference)));
 article.append(richText(post.text),el('div',{class:'post-actions'},link('View conversation','/thread/'+r.root,{class:'post-link'}),el('span',{class:'action'},`${text(post.likes)} ${post.likes==='1'?'like':'likes'}`)));
 return article;
}
function timestamp(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<0)return '';const date=new Date(n*1000);return Number.isFinite(date.getTime())?date.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'';}
function shell(title){
 const rail=el('aside',{class:'rail',id:'community-navigation'},link('◉ rolling.chat','/home',{class:'brand'}),el('nav',{class:'nav-group','aria-label':'Community'},link('Conversations','/home'),link('Explore subboards','/directory')),el('p',{class:'rail-foot'},'Public conversations. Private participation.'));
 const closeMenu=()=>{rail.classList.remove('open');rail.inert=narrow.matches;document.querySelector('.workspace').inert=false;menu.setAttribute('aria-expanded','false');menu.focus();};
 const menu=button('☰',()=>{rail.inert=false;rail.classList.add('open');document.querySelector('.workspace').inert=true;menu.setAttribute('aria-expanded','true');rail.querySelector('a').focus();},{class:'menu-toggle','aria-label':'Open navigation','aria-expanded':'false','aria-controls':'community-navigation'});
 rail.append(button('×',closeMenu,{class:'mobile-close','aria-label':'Close navigation'}));rail.inert=narrow.matches;
 rail.addEventListener('keydown',event=>{if(event.key==='Escape')closeMenu();if(event.key==='Tab'&&rail.classList.contains('open')){const targets=[...rail.querySelectorAll('a,button')],first=targets[0],last=targets.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
 main=el('main',{id:'content',tabindex:'-1'},el('header',{class:'page-head'},el('div',{},el('h1',{tabindex:'-1'},title),el('p',{class:'intro'},'Read the conversation without connecting an account.'))));
 const context=el('aside',{class:'context'},el('section',{},el('h2',{},'About this board'),el('p',{},'Posts and reactions are recorded onchain. Named identities and authenticated Bok replies are shown with their conversations.'),el('p',{class:'quiet'},'Public reader · account actions are not yet connected in this development build.')));
 app.replaceChildren(el('div',{class:'shell'},rail,el('div',{class:'workspace'},el('header',{class:'topbar'},menu,el('p',{},'rolling.chat'),link('Explore subboards','/directory',{class:'search-link'})),el('div',{class:'layout'},main,context))));
 return main;
}
function boardCard(board){
 const rules=el('details',{},el('summary',{},'Effective rules'),el('h3',{},'Parent rules'),richText(board.mainRules),el('h3',{},'Local rules'),richText(board.rules));
 return el('article',{class:'post'},el('h2',{},text(board.name)),el('p',{class:'quiet'},'/'+text(board.slug)),el('p',{},text(board.description)),board.rejected?el('p',{class:'removed'},'Rejected by the main board: '+text(board.rejection?.reason)):null,rules);
}
async function render(){
 controller?.abort();controller=new AbortController();const signal=controller.signal,current=++sequence;
 const parts=route.split('/').filter(Boolean);let api='feed',parameters={limit:30},title='Conversations';
 if(parts[0]==='directory'){api='directory';title='Explore subboards';try{parameters.query=parts[1]?decodeURIComponent(parts[1]):'';}catch{shell('Page not found');return;}}
 else if(['thread','profile','post'].includes(parts[0])){if(!field(parts[1])){shell('Page not found');return;}api=parts[0];parameters=api==='post'?{id:parts[1]}:{limit:30,[api==='thread'?'root':'nameId']:parts[1]};title=api==='thread'?'Conversation':api==='profile'?'Profile':'Post';}
 else if(parts[0]!=='home'){shell('Page not found');return;}
 shell(title);const loading=el('p',{role:'status','aria-busy':'true'},'Loading conversations…');main.append(loading);
 if(api==='directory'){
  const input=el('input',{type:'search',value:parameters.query,placeholder:'Search names, descriptions or slugs','aria-label':'Search subboards',maxlength:120});
  const form=el('form',{class:'directory-search',onSubmit:event=>{event.preventDefault();location.hash='/directory/'+encodeURIComponent(input.value.trim());}},input,el('button',{class:'button',type:'submit'},'Search'));main.insertBefore(form,loading);
 }
 const container=el('section',{class:'feed','aria-label':title});let data;
 function append(response){
  if(api==='directory'){if(!Array.isArray(response.boards))throw Error('Invalid directory');container.append(...response.boards.map(boardCard));}
  else{const posts=api==='post'?(response.post?[response.post]:[]):response.posts;if(!Array.isArray(posts))throw Error('Invalid feed');container.append(...posts.map(post=>postCard(post,response)));}
 }
 try{
  data=await read(api,parameters,signal);if(current!==sequence)return;append(data);loading.remove();
  if(api==='profile'&&data.identity){main.querySelector('h1').textContent=text(data.identity.first)+' '+text(data.identity.last);}
  if(!container.childElementCount)container.append(el('div',{class:'empty'},el('h2',{},'A little quiet here'),el('p',{},api==='directory'?'No subboards match this search.':'No posts to show yet.')));
  main.append(container);
  let cursor=data.nextCursor;
  const more=button('Load more',async()=>{
   more.disabled=true;
   try{const page=await read(api,{...parameters,cursor},signal);if(current!==sequence)return;append(page);cursor=page.nextCursor;if(!cursor)more.remove();else more.disabled=false;announce('More conversations loaded.');}
   catch(error){if(signal.aborted)return;more.remove();main.append(el('p',{role:'alert'},'The conversation changed or could not load. ',button('Refresh',()=>render())));}
  });if(cursor)main.append(more);
  main.append(el('p',{class:'quiet'},'Checked against chain block '+String(data.checkpoint?.number??'')));
  focusRoute(route,positions.get(route),current===1);
 }catch(error){if(signal.aborted)return;loading.remove();main.append(el('div',{class:'empty',role:'alert'},el('h2',{},error.code==='READER_SYNCING'?'Conversations are being checked':'Conversations could not load'),el('p',{},'No account or transaction has changed.'),button('Try again',()=>render())));}
}
document.querySelector('.skip').addEventListener('click',skipToContent);
addEventListener('hashchange',()=>{positions.set(route,{y:scrollY,focus:document.activeElement?.getAttribute('href')});route=location.hash.slice(1)||'/home';render();});
narrow.addEventListener('change',()=>{const rail=document.querySelector('.rail'),workspace=document.querySelector('.workspace');if(rail){rail.classList.remove('open');rail.inert=narrow.matches;workspace.inert=false;document.querySelector('.menu-toggle')?.setAttribute('aria-expanded','false');}});
render();
