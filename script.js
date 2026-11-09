const feedback = document.querySelector('.message');
let feedbackTimer;
const messages = { new: 'Novo jogo — em desenvolvimento' };

// Preferências carregadas antes de registrar os sons da interface.
const defaults = { masterVolume:85, effectsVolume:85, musicVolume:85, brightness:60, scale:100, fullscreen:false, language:'pt', screenEffects:true, tips:true };
let settings = { ...defaults };
try { settings = { ...settings, ...JSON.parse(localStorage.getItem('paranoiaSettings') || '{}') }; } catch {}
// Normaliza valores persistidos para impedir NaN ou volumes fora da faixa.
for (const key of ['masterVolume','effectsVolume','musicVolume','brightness']) {
  const value=Number(settings[key]);
  settings[key]=Number.isFinite(value) ? Math.max(0,Math.min(100,value)) : defaults[key];
}
settings.screenEffects=Boolean(settings.screenEffects);
settings.tips=Boolean(settings.tips);
settings.language=settings.language==='en'?'en':'pt';

// Trilha do menu: primeiro o rádio sozinho; nos últimos 0,5s começa Old Doll,
// que assume a reprodução em loop depois que a interferência termina.
const radioIntro = document.getElementById('radioIntro');
const oldDollLoop = document.getElementById('oldDollLoop');
const newGameAmbience = document.getElementById('newGameAmbience');
const chapterSoundscape = document.getElementById('chapterSoundscape');
const chapterWhoosh = document.getElementById('chapterWhoosh');
const chapterCard = document.getElementById('chapterCard');
let chapterCardTimer = null;
let chapterCardShown = false;
const newGameScene = document.getElementById('newGameScene');
let newGameStarted = false;
let loadingTipTimer = null;
const loadingTips = [
  {pt:'Respirar te ajuda a se acalmar',en:'Breathing helps you calm down'},
  {pt:'Memórias antigas não foram apagadas, só enterradas',en:'Old memories were not erased, only buried'},
  {pt:'Não ouça eles',en:'Do not listen to them'},
  {pt:'As vozes mentem',en:'The voices lie'},
  {pt:'Foque na realidade',en:'Focus on reality'}
];
let loadingTipIndex = 0;
function showNextLoadingTip(){
  const tip = document.getElementById('loadingTip');
  if(!tip || !settings.tips) return;
  tip.classList.add('tip-changing');
  setTimeout(()=>{
    // Sorteia uma dica diferente da atual, sem seguir uma ordem fixa.
    let nextIndex = Math.floor(Math.random() * loadingTips.length);
    if (loadingTips.length > 1) {
      while (nextIndex === loadingTipIndex) nextIndex = Math.floor(Math.random() * loadingTips.length);
    }
    loadingTipIndex = nextIndex;
    tip.textContent = loadingTips[loadingTipIndex][settings.language];
    tip.classList.remove('tip-changing');
  }, 350);
}
// Som único de clique enviado para esta versão.
const hoverSound = new Audio('assets/audio/hover-v24.mp3');
const clickSound = new Audio('assets/audio/click-v24-2(1).mp3');
function playUiSound(audio) {
  if (!audio) return;
  // Uma cópia por interação evita que um som interrompa outro e mantém
  // o áudio funcional mesmo depois de atualizar a lista de saves.
  const playback = audio.cloneNode();
  playback.volume = Math.max(0, Math.min(1,
    (settings.masterVolume / 100) * (settings.effectsVolume / 100)
  ));
  playback.preload = 'auto';
  const promise = playback.play();
  if (promise && typeof promise.catch === 'function') promise.catch(() => {});
}
const clickableSelector = 'button, .save-slot, input[type="range"]';
// Dispara uma vez ao entrar no elemento, não ao passar entre seus filhos.
document.addEventListener('pointerover', event => {
  if (!(event.target instanceof Element)) return;
  const target = event.target.closest(clickableSelector);
  if (!target || document.body.classList.contains('intro-locked') || !target.closest('#contentWarning') && !target.closest('#warningLanguage') && !target.closest('#radioBoot') && document.getElementById('newGameScene')?.classList.contains('reveal')) return;
  if (document.getElementById('contentWarning') && !document.getElementById('contentWarning').classList.contains('warning-dismiss') && !target.closest('#contentWarning')) return;
  if (event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) return;
  playUiSound(hoverSound);
}, true);
document.addEventListener('click', event => {
  if (!(event.target instanceof Element) || !event.target.closest(clickableSelector)) return;
  const target=event.target.closest(clickableSelector);
  if (document.getElementById('contentWarning') && !document.getElementById('contentWarning').classList.contains('warning-dismiss') && !target.closest('#contentWarning')) return;
  if (document.body.classList.contains('intro-locked') || document.getElementById('newGameScene')?.classList.contains('reveal') && !target.closest('#newGameScene')) return;
  playUiSound(clickSound);
}, true);
let titleAudioStarted = false;
let dollStarted = false;
let tvPowerOnStarted = false;
const radioBoot = document.getElementById('radioBoot');
const contentWarning = document.getElementById('contentWarning');
const warningProceed = document.getElementById('warningProceed');
const warningExit = document.getElementById('warningExit');
// Volume configurado e fade são independentes. Cada faixa mantém um único
// fade ativo, evitando que animações antigas sobrescrevam ajustes recentes.
const audioFadeLevels = new WeakMap();
const audioFadeFrames = new WeakMap();
function clamp01(value){
  const number=Number(value);
  return Number.isFinite(number) ? Math.max(0,Math.min(1,number)) : 0;
}
function configuredVolume(media){
  const type=media?.dataset?.audioType;
  const channel=type==='music' ? settings.musicVolume : type==='effect' ? settings.effectsVolume : 100;
  const master=clamp01(Number(settings.masterVolume)/100);
  const channelLevel=clamp01(Number(channel)/100);
  const base=clamp01(media?.dataset?.baseVolume ?? 1);
  return master*channelLevel*base;
}
function setMediaVolume(media){
  if(!media) return;
  const fadeLevel=audioFadeLevels.has(media) ? audioFadeLevels.get(media) : 1;
  try { media.volume=clamp01(configuredVolume(media)*fadeLevel); } catch {}
}
function refreshAudioVolumes(){
  document.querySelectorAll('audio, video').forEach(setMediaVolume);
  const uiVolume=clamp01(Number(settings.masterVolume)/100)*clamp01(Number(settings.effectsVolume)/100);
  [clickSound,hoverSound].forEach(media=>{ media.volume=uiVolume; });
}
function fadeMedia(media,fromLevel,toLevel,duration=500){
  if(!media) return;
  const previousFrame=audioFadeFrames.get(media);
  if(previousFrame) cancelAnimationFrame(previousFrame);
  const from=clamp01(fromLevel), to=clamp01(toLevel);
  const started=performance.now();
  const step=now=>{
    const progress=Math.min(1,(now-started)/Math.max(1,duration));
    audioFadeLevels.set(media,from+(to-from)*progress);
    setMediaVolume(media);
    if(progress<1) audioFadeFrames.set(media,requestAnimationFrame(step));
    else { audioFadeLevels.set(media,to); audioFadeFrames.delete(media); setMediaVolume(media); }
  };
  audioFadeLevels.set(media,from);
  setMediaVolume(media);
  audioFadeFrames.set(media,requestAnimationFrame(step));
}
function currentFadeLevel(media){ return audioFadeLevels.has(media) ? audioFadeLevels.get(media) : 1; }

async function showChapterCard(){
  if(chapterCardShown || !newGameStarted || !chapterCard) return;
  chapterCardShown=true;

  const chapterTitle=chapterCard.querySelector('h2');
  const chapterSubtitle=chapterCard.querySelector('p');
  if(!chapterTitle || !chapterSubtitle) return;
  updateChapterCardLanguage();

  // A tela inteira fica preta enquanto a música de carregamento desaparece.
  chapterCard.classList.remove('chapter-title-visible','chapter-subtitle-visible','chapter-card-finale','chapter-end-visible');
  chapterCard.classList.add('chapter-card-active','chapter-card-darkening');
  chapterCard.setAttribute('aria-hidden','false');
  if(loadingTipTimer){ clearInterval(loadingTipTimer); loadingTipTimer=null; }
  if(newGameAmbience && !newGameAmbience.paused){
    fadeMedia(newGameAmbience,currentFadeLevel(newGameAmbience),0,1500);
  }
  await delay(1550);
  if(newGameAmbience){ newGameAmbience.pause(); newGameAmbience.currentTime=0; }

  // Só depois do apagão a paisagem sonora começa, baixa, sob o primeiro título.
  if(chapterSoundscape){
    chapterSoundscape.currentTime=4; // Começa quatro segundos depois do início original da faixa.
    audioFadeLevels.set(chapterSoundscape,0);
    setMediaVolume(chapterSoundscape);
    const ambiencePlay=chapterSoundscape.play();
    if(ambiencePlay && ambiencePlay.catch) ambiencePlay.catch(error=>console.warn('Não foi possível iniciar a paisagem sonora:',error));
    fadeMedia(chapterSoundscape,0,1,1300);
  }

  chapterCard.classList.remove('chapter-card-darkening');
  chapterCard.classList.add('chapter-title-visible');
  await delay(2700);

  // O primeiro título desaparece completamente antes do subtítulo entrar.
  chapterCard.classList.remove('chapter-title-visible');
  await delay(750);

  // O whoosh acompanha somente a entrada de "Memórias do passado".
  if(chapterWhoosh){
    chapterWhoosh.pause();
    chapterWhoosh.currentTime=0;
    chapterWhoosh.playbackRate=0.75;
    audioFadeLevels.set(chapterWhoosh,0);
    setMediaVolume(chapterWhoosh);
    const whooshPlay=chapterWhoosh.play();
    if(whooshPlay && whooshPlay.catch) whooshPlay.catch(error=>console.warn('Não foi possível iniciar o som do capítulo:',error));
    fadeMedia(chapterWhoosh,0,1,650);
  }
  chapterCard.classList.add('chapter-subtitle-visible');

  // O subtítulo fica na tela por 1,5s a menos que na versão anterior.
  await delay(6200);

  // O texto, a paisagem sonora e o whoosh somem; o fim fica totalmente em silêncio.
  chapterCard.classList.remove('chapter-subtitle-visible');
  chapterCard.classList.add('chapter-card-finale');
  if(chapterSoundscape && !chapterSoundscape.paused){
    fadeMedia(chapterSoundscape,currentFadeLevel(chapterSoundscape),0,1600);
  }
  if(chapterWhoosh && !chapterWhoosh.paused){
    fadeMedia(chapterWhoosh,currentFadeLevel(chapterWhoosh),0,500);
  }
  await delay(1650);
  if(chapterSoundscape){ chapterSoundscape.pause(); chapterSoundscape.currentTime=0; }
  if(chapterWhoosh){ chapterWhoosh.pause(); chapterWhoosh.currentTime=0; }
  chapterCard.classList.remove('chapter-title-visible','chapter-subtitle-visible');
  // Depois do apagão completo e do silêncio, mostra o aviso final sem botões.
  chapterCard.classList.add('chapter-end-visible');
  chapterCard.setAttribute('aria-hidden','false');
}

async function beginNewGame(){
  if(newGameStarted) return;
  newGameStarted=true;
  // Primeiro o menu apaga e a trilha atual desaparece rapidamente.
  newGameScene.classList.add('dark');
  [radioIntro,oldDollLoop].forEach(track=>{
    if(track && !track.paused) fadeMedia(track,currentFadeLevel(track),0,420);
  });
  await delay(480);
  [radioIntro,oldDollLoop].forEach(track=>{ if(track){track.pause();track.volume=0;} });
  // O olho aparece enquanto a nova ambiência cresce até o volume configurado.
  newGameScene.classList.add('reveal');
  newGameScene.setAttribute('aria-hidden','false');
  if(chapterCardTimer) clearTimeout(chapterCardTimer);
  chapterCardShown=false;
  chapterCardTimer=setTimeout(showChapterCard,10000);
  // O temporizador sempre é iniciado ao entrar na tela. A opção 'dicas'
  // controla a rotação dentro de showNextLoadingTip(), então ativá-la depois
  // de abrir a tela também funciona sem precisar reiniciar o jogo.
  const tip = document.getElementById('loadingTip');
  if (tip) tip.textContent = loadingTips[loadingTipIndex][settings.language];
  if (loadingTipTimer) clearInterval(loadingTipTimer);
  loadingTipTimer = setInterval(showNextLoadingTip, 4000);
  if(newGameAmbience){
    newGameAmbience.currentTime=0;
    newGameAmbience.volume=0;
    const playing=newGameAmbience.play();
    if(playing && playing.catch) playing.catch(error=>console.warn('Não foi possível iniciar a ambiência:',error));
    fadeMedia(newGameAmbience,0,1,1800);
  }
  document.querySelector('.content')?.setAttribute('aria-hidden','true');
}
function startTvPowerOn(){
  if(tvPowerOnStarted || !radioBoot) return;
  tvPowerOnStarted=true;
  radioBoot.classList.remove('radio-active');
  radioBoot.classList.add('tv-power-on');
  const unlockMenu = () => { radioBoot.classList.add('off'); document.body.classList.remove('intro-locked'); };
  radioBoot.addEventListener('animationend', unlockMenu, {once:true});
  // Fallback: algumas combinações de navegador/áudio não disparam animationend.
  setTimeout(unlockMenu, 2200);
}
function monitorRadioIntro(){
  if(!titleAudioStarted || dollStarted) return;
  const remaining=radioIntro.duration-radioIntro.currentTime;
  // A tela acende 50 ms antes do início de Old Doll (que entra aos 500 ms finais).
  if(!tvPowerOnStarted && remaining<=0.55) startTvPowerOn();
  if(remaining>0 && !dollStarted) requestAnimationFrame(monitorRadioIntro);
}
function startOldDoll(){
  if(dollStarted || !oldDollLoop) return;
  dollStarted=true;
  oldDollLoop.volume=0;
  audioFadeLevels.set(oldDollLoop,0);
  oldDollLoop.currentTime=0;
  const p=oldDollLoop.play();
  if(p && p.then) p.then(()=>fadeMedia(oldDollLoop,0,1,500)).catch(error=>{
    dollStarted=false;
    console.warn('Não foi possível iniciar Old Doll:',error);
  });
  else fadeMedia(oldDollLoop,0,1,500);
}
function updateTitleAudioVolumes(){
  // Atualiza também faixas pausadas: ao retomarem, já estarão no volume certo.
  refreshAudioVolumes();
}
function startTitleAudio(){
  if(titleAudioStarted || !radioIntro) return;
  titleAudioStarted=true;
  radioBoot?.classList.add('radio-active');
  audioFadeLevels.set(radioIntro,1);
  radioIntro.volume=configuredVolume(radioIntro);
  radioIntro.currentTime=0;
  radioIntro.play().then(()=>requestAnimationFrame(monitorRadioIntro)).catch(error=>{
    titleAudioStarted=false;
    console.warn('Não foi possível iniciar o áudio do rádio:',error);
    // Não deixa o menu permanentemente bloqueado se o áudio falhar.
    startTvPowerOn();
    setTimeout(()=>document.body.classList.remove('intro-locked'),2200);
  });
}
function tryStartTitleAudio(){
  if(!titleAudioStarted) startTitleAudio();
}
radioIntro?.addEventListener('timeupdate',()=>{
  if(!tvPowerOnStarted && Number.isFinite(radioIntro.duration) && radioIntro.duration-radioIntro.currentTime<=0.55) startTvPowerOn();
  if(!dollStarted && Number.isFinite(radioIntro.duration) && radioIntro.duration-radioIntro.currentTime<=0.5){
    startOldDoll();
    fadeMedia(radioIntro,currentFadeLevel(radioIntro),0,500);
  }
});
radioIntro?.addEventListener('ended',startOldDoll);
// A abertura só começa depois da confirmação explícita no aviso de conteúdo.
document.getElementById('warningLanguage')?.addEventListener('click',()=>{settings.language=settings.language==='pt'?'en':'pt';saveSettings();applySettings();});
warningProceed?.addEventListener('click',()=>{
  document.body.classList.add('intro-locked');
  if(contentWarning){
    contentWarning.classList.add('warning-dismiss');
    contentWarning.setAttribute('aria-hidden','true');
    setTimeout(()=>contentWarning.remove(),420);
  }
  startTitleAudio();
});
warningExit?.addEventListener('click',()=>{
  window.close();
  // Navegadores podem bloquear o fechamento de abas abertas pelo usuário.
  if(!window.closed){
    document.body.innerHTML=`<main class="warning-exit-message">${settings.language==='pt'?'Você escolheu sair de Paranoia. Pode fechar esta aba.':'You chose to leave Paranoia. You can close this tab.'}</main>`;
  }
});
document.querySelectorAll('.menu-button').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.action === 'settings') openSettings();
    else if (button.dataset.action === 'load') openSaves();
    else if (button.dataset.action === 'new') beginNewGame();
    else {
      feedback.textContent = messages[button.dataset.action];
      feedback.classList.add('show');
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => feedback.classList.remove('show'), 2400);
    }
  });
});

// Tela de carregamento: dez espaços independentes, sem sobrescrever outros arquivos.
const saveScreen = document.getElementById('saveScreen');
const saveSlotsContainer = document.getElementById('saveSlots');
const saveNote = document.getElementById('saveNote');
const SAVE_PREFIX = 'paranoiaSaveSlot_';
let selectedSlot = 0;

function readSlot(index){
  try { return JSON.parse(localStorage.getItem(SAVE_PREFIX+index) || 'null'); }
  catch { return null; }
}
function renderSlots(){
  saveSlotsContainer.innerHTML='';
  for(let i=0;i<10;i++){
    const data=readSlot(i);
    const slot=document.createElement('article');
    slot.className='save-slot'+(data?'':' empty');
    slot.dataset.slot=i; slot.tabIndex=0;
    slot.setAttribute('aria-label',`${t('file')} ${i+1}${data?', '+t('savedFile'):', '+t('emptyFile')}`);
    slot.innerHTML=`<span class="slot-pointer" aria-hidden="true">▶</span>
      <div class="slot-thumb ${data?'':'empty-thumb'}">${data?'<img src="assets/save-thumb.png" alt="Miniatura do local salvo">':'＋'}</div>
      <div class="slot-info"><div class="slot-topline"><span>${t('file')} ${i+1}</span><time>${data?(data.date||'--/--/---- --:--'):'---'}</time></div>
      <p class="slot-chapter">${data?(data.chapter||(settings.language==='pt'?'progresso salvo':'saved progress')):t('emptyFile')}</p>
      <div class="slot-details">${data?`<span>◷&nbsp; ${data.time||'--:--:--'}</span><span>☠&nbsp; ${data.deaths||'--'}</span><span>♥&nbsp; ${data.hearts||'--'}</span>`:'---'}</div></div>`;
    slot.addEventListener('click',()=>selectSlot(i));
    slot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectSlot(i);}});
    saveSlotsContainer.appendChild(slot);
  }
  selectSlot(selectedSlot);
}
function selectSlot(index){
  selectedSlot=Math.max(0,Math.min(9,index));
  [...saveSlotsContainer.querySelectorAll('.save-slot')].forEach((slot,i)=>slot.classList.toggle('selected',i===selectedSlot));
  const data=readSlot(selectedSlot);
  saveNote.textContent=data?t('selected'):t('emptyNote');
}
function openSaves(){saveScreen.hidden=false;renderSlots();}
function closeSaves(){saveScreen.hidden=true;document.querySelector('.menu-button[data-action="load"]')?.focus();}
document.getElementById('saveBackButton').addEventListener('click',closeSaves);
document.getElementById('deleteSaveButton').addEventListener('click',()=>{
  const data=readSlot(selectedSlot);
  if(!data){saveNote.textContent=t('alreadyEmpty');return;}
  if(confirm(`${t('deleteConfirm')} ${selectedSlot+1}?`)){
    localStorage.removeItem(SAVE_PREFIX+selectedSlot);
    renderSlots();saveNote.textContent=`${t('deleted')} ${selectedSlot+1}.`;
  }
});

const titleLetters = [...document.querySelectorAll('.title-sprite img')];
const letterPairs = [[0,7],[1,6],[2,5],[3,4]];
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const movePair = (pair, from, to, duration) => pair.forEach(index => titleLetters[index].animate(
  [{ transform:`translate3d(0, ${from}px, 0)` },{ transform:`translate3d(0, ${to}px, 0)` }],
  { duration, easing:'cubic-bezier(0.42, 0, 0.58, 1)', fill:'forwards' }
));
async function animateTitle() {
  const stagger=135, duration=620, distance=7;
  while(true) {
    for(const pair of letterPairs) { movePair(pair,0,distance,duration); await delay(stagger); }
    await delay(duration-stagger);
    for(const pair of letterPairs) { movePair(pair,distance,0,duration); await delay(stagger); }
    await delay(duration-stagger);
  }
}
animateTitle();

// Preferências persistidas localmente neste navegador (carregadas no início).
const settingsScreen = document.getElementById('settingsScreen');
const settingsNote = document.getElementById('settingsNote');
const scaleSteps = [80,90,100];
// Limita também preferências antigas salvas acima de 100%.
settings.scale = Math.min(100, Math.max(80, Number(settings.scale) || 100));
const translations = {
  pt:{newGame:'NOVO JOGO',loadGame:'CARREGAR',settingsTitle:'CONFIGURAÇÕES',masterVolume:'volume geral',effectsVolume:'volume de efeitos',musicVolume:'volume da música',brightness:'brilho',resolution:'escala da tela',fullscreen:'tela cheia',language:'idioma',screenEffects:'efeitos de tela',tips:'dicas',back:'voltar',yes:'sim',no:'não',portuguese:'português',english:'inglês',saved:'configuração salva',warning:'Este jogo contém luzes piscantes e alguns tópicos fortes, como trauma e uso de medicações controladas. Se você se sente desconfortável com algum desses aspectos, aconselhamos que feche o jogo.',proceed:'Prosseguir',exit:'Sair',saveTitle:'Carregar jogo',saveBack:'voltar',saveHint:'selecione um arquivo para carregar',deleteSave:'excluir arquivo',file:'arquivo',savedFile:'salvo',emptyFile:'vazio',selected:'Arquivo selecionado.',emptyNote:'Espaço vazio — nenhum save será sobrescrito.',alreadyEmpty:'Este espaço já está vazio.',deleteConfirm:'Deseja excluir permanentemente o arquivo',deleted:'Arquivo excluído.',thumb:'Miniatura do local salvo',fullscreenError:'Fullscreen indisponível neste navegador.',prototype:'PROTÓTIPO'},
  en:{newGame:'NEW GAME',loadGame:'LOAD GAME',settingsTitle:'SETTINGS',masterVolume:'master volume',effectsVolume:'sound effects',musicVolume:'music volume',brightness:'brightness',resolution:'display scale',fullscreen:'fullscreen',language:'language',screenEffects:'screen effects',tips:'hints',back:'back',yes:'yes',no:'no',portuguese:'portuguese',english:'english',saved:'setting saved',warning:'This game contains flashing lights and sensitive themes, such as trauma and the use of controlled medication. If you feel uncomfortable with any of these topics, we recommend that you close the game.',proceed:'Continue',exit:'Exit',saveTitle:'Load game',saveBack:'back',saveHint:'select a file to load',deleteSave:'delete file',file:'file',savedFile:'saved',emptyFile:'empty',selected:'File selected.',emptyNote:'Empty slot — no save will be overwritten.',alreadyEmpty:'This slot is already empty.',deleteConfirm:'Do you want to permanently delete file',deleted:'File deleted.',thumb:'Saved location thumbnail',fullscreenError:'Fullscreen is unavailable in this browser.',prototype:'PROTOTYPE'}
};
function t(key){ return translations[settings.language]?.[key] || translations.pt[key] || key; }
function updateChapterCardLanguage(){
  if(!chapterCard) return;
  const title=chapterCard.querySelector('h2');
  const subtitle=chapterCard.querySelector('.chapter-card-text p');
  const endMessage=chapterCard.querySelector('.chapter-end-message p');
  if(title) title.textContent=settings.language==='en'?'Chapter one':'Capítulo um';
  if(subtitle) subtitle.textContent=settings.language==='en'?'Past memories':'Memórias do passado';
  if(endMessage) endMessage.textContent=settings.language==='en'
    ? 'The game is still in development, and this first chapter will be completed soon. Thank you for your interest in our small project!'
    : 'O jogo ainda está em desenvolvimento e esse primeiro capítulo será concluído em breve, obrigado pela sua atenção em nosso pequeno projeto!';
}
function saveSettings(){ localStorage.setItem('paranoiaSettings',JSON.stringify(settings)); }
function applySettings(){
  updateChapterCardLanguage();
  const menu=document.querySelector('.menu');
  const content=document.querySelector('.content');
  const screenBrightness=0.45+(Number(settings.brightness)/100)*0.85;
  menu?.style.setProperty('--screen-brightness',screenBrightness);
  if(content) content.style.zoom=`${settings.scale}%`;
  document.body.classList.toggle('screen-effects-off',!settings.screenEffects);
  document.querySelectorAll('.menu-button').forEach((button,index)=>{
    button.textContent=[t('newGame'),t('loadGame'),t('settingsTitle')][index] ?? button.textContent;
  });
  document.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent=t(el.dataset.i18n); });
  const setText=(selector,value)=>{ const el=document.querySelector(selector); if(el) el.textContent=value; };
  setText('#warningText',t('warning'));
  setText('#warningProceed',t('proceed'));
  setText('#warningExit',t('exit'));
  setText('#warningLanguage',settings.language==='pt'?'ENGLISH':'PORTUGUÊS');
  setText('.save-heading h2',t('saveTitle'));
  setText('#saveBackButton span',t('saveBack'));
  setText('.save-hint',t('saveHint'));
  setText('#deleteSaveButton span',t('deleteSave'));
  const tip=document.getElementById('loadingTip');
  // Mantém a dica visível sincronizada com o idioma atual, mesmo se
  // o idioma for alterado antes da tela de carregamento começar.
  if(tip) tip.textContent=loadingTips[loadingTipIndex][settings.language];
  if(saveScreen && !saveScreen.hidden) renderSlots();
  if(settingsNote && settingsNote.textContent) settingsNote.textContent=t('saved');
  const version=document.querySelector('.version');
  if(version) version.innerHTML=`PARANOIA <span>—</span> ${t('prototype')}`;
  document.querySelectorAll('.setting-row').forEach(row=>{
    const key=row.dataset.setting;
    const input=row.querySelector('input');
    const output=row.querySelector('output');
    const valueOutput=row.querySelector('.value-output');
    if(input){ input.value=settings[key]; if(output) output.textContent=`${settings[key]}%`; }
    else if(key==='scale' && output) output.textContent=`${settings.scale}%`;
    else if(key==='fullscreen' && valueOutput) valueOutput.textContent=settings.fullscreen?t('yes'):t('no');
    else if(key==='language' && valueOutput) valueOutput.textContent=settings.language==='pt'?t('portuguese'):t('english');
    else if((key==='screenEffects'||key==='tips') && valueOutput) valueOutput.textContent=settings[key]?t('yes'):t('no');
  });
  refreshAudioVolumes();
}
function openSettings(){ settingsScreen.hidden=false; applySettings(); document.querySelector('.setting-row')?.classList.add('selected'); }
function closeSettings(){ settingsScreen.hidden=true; document.querySelector('.menu-button[data-action="settings"]')?.focus(); }
document.getElementById('backButton').addEventListener('click',closeSettings);
document.querySelectorAll('.setting-row input').forEach(input=>input.addEventListener('input',()=>{
  const row=input.closest('.setting-row');
  if(!row) return;
  settings[row.dataset.setting]=Number(input.value);
  saveSettings();
  applySettings();
}));
document.querySelectorAll('.setting-row [data-step]').forEach(button=>button.addEventListener('click',()=>{
  const row=button.closest('.setting-row');
  if(!row) return;
  const key=row.dataset.setting, step=Number(button.dataset.step);
  if(key==='scale'){
    const index=scaleSteps.indexOf(settings.scale);
    settings.scale=scaleSteps[Math.max(0,Math.min(scaleSteps.length-1,index+step))];
  } else settings[key]=Math.max(0,Math.min(100,Number(settings[key])+step));
  saveSettings();
  applySettings();
}));
document.querySelector('[data-toggle="screenEffects"]')?.addEventListener('click',()=>{
  settings.screenEffects=!settings.screenEffects; saveSettings(); applySettings();
});
document.querySelector('[data-toggle="tips"]')?.addEventListener('click',()=>{
  settings.tips=!settings.tips; saveSettings(); applySettings();
});
document.querySelector('[data-cycle="language"]')?.addEventListener('click',()=>{
  settings.language=settings.language==='pt'?'en':'pt'; saveSettings(); applySettings();
});
document.querySelector('[data-toggle="fullscreen"]').addEventListener('click',async()=>{
  try { if(!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); }
  catch { settingsNote.textContent=t('fullscreenError'); }
  settings.fullscreen=!!document.fullscreenElement; saveSettings(); applySettings();
});
document.addEventListener('fullscreenchange',()=>{settings.fullscreen=!!document.fullscreenElement;saveSettings();applySettings();});
document.addEventListener('keydown',e=>{
  if(settingsScreen.hidden && saveScreen.hidden) return;
  if(e.key==='Escape' || e.key==='Backspace'){e.preventDefault(); if(!settingsScreen.hidden) closeSettings(); else closeSaves(); return;}
  if(!saveScreen.hidden && (e.key==='ArrowDown'||e.key==='ArrowUp')){ selectSlot(selectedSlot + (e.key==='ArrowDown'?1:-1));
    saveSlotsContainer.querySelector(`[data-slot="${selectedSlot}"]`)?.scrollIntoView({block:'nearest'}); e.preventDefault(); return; }
  if(!settingsScreen.hidden && (e.key==='ArrowDown'||e.key==='ArrowUp')){
    const rows=[...document.querySelectorAll('.setting-row')], current=rows.findIndex(r=>r.classList.contains('selected'));
    rows.forEach(r=>r.classList.remove('selected'));
    const next=(current+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length; rows[next].classList.add('selected');
    rows[next].querySelector('input,button')?.focus(); e.preventDefault();
  }
});
applySettings();
