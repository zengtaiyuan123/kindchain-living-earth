"use client";

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EMPTY_MESSENGER_MEMORY, GLOBE_ZOOM_STOPS, coarsePublicPoint, messengerProfileFor, nearestZoomStop, sanitizeMessengerMemory } from "./kindchain-domain.mjs";

type ThreeModule = typeof import("three");

type Locale = "en" | "zh" | "es" | "fr" | "ja";
type TimePhase = "dawn" | "day" | "dusk" | "night";
type WeatherKind = "clear" | "cloud" | "fog" | "rain" | "snow" | "storm";
type Biome = "polar" | "boreal" | "temperate" | "desert" | "tropical" | "coastal" | "mountain";
type Hazard = "none" | "heat" | "dust" | "dry" | "ice";
type Environment = {
  time: TimePhase;
  weather: WeatherKind;
  biome: Biome;
  hazard: Hazard;
  aurora: boolean;
  auroraChance: number;
};
type Panel = "story" | "region" | "nearby" | "archive" | "menu" | "compose" | "journeys" | "pulse" | null;
type ComposeMode = "light" | "reply" | "wish";
type ComposeScene = "terminator" | "region-choir" | "night-watch" | "weather-shelter" | null;
type Delivery = "random" | "nearby" | "place";
type CourierMode = "hand" | "pigeon" | "carriage" | "rail" | "plane" | "rocket" | "starship";
type RegionZone = "northern-lakes" | "arctic" | "east-asia" | "mediterranean" | "savanna" | "desert-belt" | "tropical-isles" | "andes" | "open-ocean";

type GeoPoint = { lat: number; lon: number; label: string };

type ActivityOrigin = {
  cellId: string;
  centroidLat: number;
  centroidLon: number;
  regionLabel: string;
};

type ActivityBand = "quiet" | "glimmer" | "radiant" | "surge";

type DailyRegionActivity = {
  cellId: string;
  centroidLat: number;
  centroidLon: number;
  regionLabel: string;
  uniquePublishers: number;
  textCount: number;
  lightCount: number;
  wishCount: number;
  replyCount: number;
  recentCount: number;
  lastPublishedAt: number;
  intensity: number;
  band: ActivityBand;
  sample: boolean;
};

type DailyActivitySnapshot = {
  version: string;
  generatedAt: number;
  cells: DailyRegionActivity[];
  globalUnlocated: number;
};

type Journey = {
  id: string;
  storyId: string;
  mode: CourierMode;
  from: GeoPoint;
  to: GeoPoint;
  distance: number;
  etaHours: number;
  routeDistance: number;
  startedAt: number;
  demoDurationMs: number;
  courierVariant?: number;
  flockSize?: number;
};

type Reply = {
  id: string;
  lang: Locale | "auto";
  text: string;
  translations: Partial<Record<Locale, string>>;
  lat?: number;
  lon?: number;
  region?: string;
  country?: string;
  createdAt?: number;
  origin?: ActivityOrigin;
  authorDayKey?: string;
  scene?: Exclude<ComposeScene, null>;
};

type Story = {
  id: string;
  chain: string;
  lat: number;
  lon: number;
  region: string;
  country: string;
  lang: Locale | "auto";
  text: string;
  translations: Partial<Record<Locale, string>>;
  replies: Reply[];
  kind?: "light" | "wish";
  createdAt?: number;
  expiresAt?: number;
  preserved?: boolean;
  origin?: ActivityOrigin;
  authorDayKey?: string;
  scene?: Exclude<ComposeScene, null>;
};

type Weather = {
  temperature: number;
  apparent: number;
  wind: number;
  gust: number;
  cloud: number;
  precipitation: number;
  humidity: number;
  visibility: number;
  soilMoisture: number;
  code: number;
  isDay: boolean;
  localHour: number;
  timezone: string;
};

type FocusPoint = { lat: number; lon: number; nonce: number };
type ZoomCommand = { delta: number; nonce: number };
type MessengerMemory = { replies: number; distanceKm: number; weatherMarks: number; escorts: number };
type OnboardingStage = "boot" | "seeking" | "ready" | "done";
type LocationIntent = "locate" | "nearby" | null;
type ReplyCeremony = { region: string; weather: string; localTime: string; message: string };
type StoredLocalState = { version: 1; savedAt: number; stories: Story[]; journeys: Journey[] };

const MAP_ENTRY_ZOOM = 10.8;
const MAP_EXIT_ZOOM = 10.12;
const MAP_MIN_ZOOM = 9.8;
const MAP_MAX_ZOOM = 13.5;
const ONBOARDING_STORY_ID = "ke-1";

const EXTRA_UI: Record<Locale, {
  relay: string; expiring: string; capture: string; share: string; preserve: string; proof: string;
  notOnChain: string; pigeonNest: string; shares: string; slots: string; nextMorph: string;
  textOnly: string; saved: string; shared: string; chainLater: string; pigeonBusy: string;
}> = {
  en: { relay: "Relay constellation", expiring: "fades in", capture: "Keep a portrait", share: "Ask your circle", preserve: "Seal on-chain", proof: "STAR PATH PROOF", notOnChain: "Local proof · not yet on-chain", pigeonNest: "Messenger roost", shares: "kindness marks", slots: "flight slots", nextMorph: "next plumage", textOnly: "TEXT ONLY · language detected automatically", saved: "Your star-path portrait was saved.", shared: "Invitation sent. Sharing opens a door; only a real reply grows your messenger and extends the constellation.", chainLater: "Wallet and contract connection are required before real on-chain sealing.", pigeonBusy: "Your messenger is still carrying another light. A real reply, journey or escort can unlock more flight capacity." },
  zh: { relay: "限时接力星系", expiring: "后消散", capture: "星途留影", share: "向自己的圈子求接力", preserve: "链上封存", proof: "独一无二的星途凭证", notOnChain: "本地凭证 · 尚未真实上链", pigeonNest: "信使成长巢", shares: "枚善意印记", slots: "个飞行位", nextMorph: "下一次羽色蜕变", textOnly: "只接受文字 · 自动识别任何国家与语言", saved: "星途留影已经保存。", shared: "邀请已发出。分享只打开入口；真实回复才会让星系续命，也让信使成长。", chainLater: "真实链上封存需要接入钱包和正式合约；当前不会假装已经上链。", pigeonBusy: "你的小信使还在送上一封信。完成真实回复、旅程或护送，才能逐渐解锁更多飞行能力。" },
  es: { relay: "Constelación de relevo", expiring: "se desvanece en", capture: "Guardar retrato", share: "Pedir relevo", preserve: "Sellar en cadena", proof: "PRUEBA DE RUTA ESTELAR", notOnChain: "Prueba local · aún no está en cadena", pigeonNest: "Palomar mensajero", shares: "huellas de bondad", slots: "vuelos", nextMorph: "próximo plumaje", textOnly: "SOLO TEXTO · idioma detectado automáticamente", saved: "Se guardó tu retrato estelar.", shared: "Invitación enviada. Compartir abre una puerta; solo una respuesta real hace crecer al mensajero y prolonga la constelación.", chainLater: "Se necesita una cartera y un contrato real para sellar en cadena.", pigeonBusy: "Tu mensajero aún lleva otra luz. Las respuestas y los viajes desbloquean más capacidad." },
  fr: { relay: "Constellation relais", expiring: "disparaît dans", capture: "Garder un portrait", share: "Demander un relais", preserve: "Sceller sur chaîne", proof: "PREUVE DU CHEMIN D'ÉTOILES", notOnChain: "Preuve locale · pas encore sur chaîne", pigeonNest: "Colombier", shares: "traces de bonté", slots: "vols", nextMorph: "prochain plumage", textOnly: "TEXTE UNIQUEMENT · langue détectée automatiquement", saved: "Votre portrait stellaire est enregistré.", shared: "Invitation envoyée. Le partage ouvre une porte ; seule une vraie réponse fait grandir le messager et prolonge la constellation.", chainLater: "Un portefeuille et un contrat réel sont requis pour le scellement.", pigeonBusy: "Votre messager porte encore une lumière. Les réponses et les voyages ouvrent plus de capacité." },
  ja: { relay: "期間限定リレー星座", expiring: "で消えます", capture: "星の旅を保存", share: "仲間にリレーを頼む", preserve: "チェーンに保存", proof: "星の旅の証明", notOnChain: "ローカル証明・まだオンチェーンではありません", pigeonNest: "伝書鳩の巣", shares: "やさしさの印", slots: "飛行枠", nextMorph: "次の羽色", textOnly: "テキストのみ・言語を自動判定", saved: "星の旅の画像を保存しました。", shared: "招待を送りました。共有は入口を開くだけで、実際の返信だけが鳩を成長させ、星座の光を延ばします。", chainLater: "実際のオンチェーン保存にはウォレットと正式なコントラクトが必要です。", pigeonBusy: "鳩はまだ別の光を運んでいます。実際の返信や旅が飛行能力を育てます。" },
};

const PULSE_UI: Record<Locale, {
  title: string; sample: string; ordinary: string; bands: Record<ActivityBand, string>;
  signals: string; recent: string; global: string; terminator: string; terminatorCopy: string;
  sendAcross: string; choir: string; choirCopy: string; addVoice: string; watch: string;
  watchCopy: string; relayNow: string; shelter: string; shelterCopy: string; shelterAction: string;
  noRank: string; compose: Record<Exclude<ComposeScene, null>, string>;
}> = {
  zh: {
    title: "此刻星潮", sample: "体验星潮 · 多人数据接入后按地区实时更新", ordinary: "普通天空 · 尚无投放", bands: { quiet: "微光", glimmer: "闪烁", radiant: "明亮", surge: "星潮" },
    signals: "束文字 / 24H", recent: "刚刚亮起", global: "全球共振", terminator: "晨昏接力", terminatorCopy: "把白昼的一句话送进仍在夜里的天空。两边都亮起，光桥才会完整。",
    sendAcross: "写一句，送过晨昏线", choir: "区域星光合奏", choirCopy: "不同的人各留一句，让这片天空长成今天独有的星纹。", addVoice: "加入一颗文字星", watch: "星链守夜",
    watchCopy: "只靠真实文字接力延长星光；分享本身不会续命。", relayNow: "写一句，接住它", shelter: "风雨避光港", shelterCopy: "雨雪、沙尘或极寒里，三句话会共同撑起一层临时光穹。", shelterAction: "写一句，撑起光穹",
    noRank: "只与晨昏、天气、距离和倒计时对抗 · 不设个人或地区排名", compose: { terminator: "晨昏接力 · 你的文字将越过明暗交界", "region-choir": "区域合奏 · 你的文字会成为下一颗星", "night-watch": "星链守夜 · 真实回复会让它继续发光", "weather-shelter": "风雨避光港 · 一句话也能成为遮雨的光" },
  },
  en: {
    title: "Living pulse", sample: "EXPERIENCE FLOW · becomes region-live with multi-user data", ordinary: "Ordinary sky · no signals yet", bands: { quiet: "Whisper", glimmer: "Glimmer", radiant: "Radiant", surge: "Star tide" },
    signals: "text signals / 24H", recent: "newly lit", global: "global resonance", terminator: "Terminator relay", terminatorCopy: "Carry one sentence from daylight into a sky that is still in night. The bridge completes only when both sides glow.",
    sendAcross: "Write across the terminator", choir: "Regional sky chorus", choirCopy: "Different people leave one true line each, shaping today's local star pattern.", addVoice: "Add one text-star", watch: "Constellation watch",
    watchCopy: "Only a real text relay extends the light; sharing alone never does.", relayNow: "Write and hold the light", shelter: "Weather shelter", shelterCopy: "In rain, snow, dust or cold, three lines raise a temporary dome of light.", shelterAction: "Write into the shelter",
    noRank: "Together against time, weather and distance · no people or region rankings", compose: { terminator: "TERMINATOR RELAY · your line will cross day and night", "region-choir": "REGIONAL CHORUS · your line becomes the next star", "night-watch": "CONSTELLATION WATCH · a real reply keeps it glowing", "weather-shelter": "WEATHER SHELTER · one line can become cover" },
  },
  es: {
    title: "Pulso vivo", sample: "FLUJO DE EXPERIENCIA · será regional en tiempo real", ordinary: "Cielo normal · aún sin señales", bands: { quiet: "Susurro", glimmer: "Destello", radiant: "Radiante", surge: "Marea estelar" },
    signals: "textos / 24H", recent: "recién encendidos", global: "resonancia global", terminator: "Relevo de amanecer", terminatorCopy: "Lleva una frase del día hacia un cielo que aún está de noche.", sendAcross: "Escribir a través de la luz", choir: "Coro regional", choirCopy: "Cada persona deja una frase y forma el dibujo estelar del día.", addVoice: "Añadir una estrella", watch: "Vigilia estelar", watchCopy: "Solo un relevo de texto prolonga la luz.", relayNow: "Escribir y sostener", shelter: "Refugio del clima", shelterCopy: "Tres frases levantan una cúpula temporal en la tormenta.", shelterAction: "Escribir en el refugio", noRank: "Juntos contra el tiempo, el clima y la distancia · sin clasificaciones", compose: { terminator: "RELEVO DEL AMANECER", "region-choir": "CORO REGIONAL", "night-watch": "VIGILIA ESTELAR", "weather-shelter": "REFUGIO DEL CLIMA" },
  },
  fr: {
    title: "Pouls vivant", sample: "FLUX D'EXPÉRIENCE · bientôt régional en direct", ordinary: "Ciel ordinaire · aucun signal", bands: { quiet: "Murmure", glimmer: "Lueur", radiant: "Rayonnant", surge: "Marée d'étoiles" },
    signals: "textes / 24H", recent: "tout juste allumés", global: "résonance mondiale", terminator: "Relais de l'aube", terminatorCopy: "Portez une phrase du jour vers un ciel encore dans la nuit.", sendAcross: "Écrire au-delà de l'aube", choir: "Chœur régional", choirCopy: "Une phrase par personne dessine le ciel local du jour.", addVoice: "Ajouter une étoile", watch: "Veille de constellation", watchCopy: "Seul un vrai relais de texte prolonge la lumière.", relayNow: "Écrire et la garder", shelter: "Abri météo", shelterCopy: "Trois phrases élèvent un dôme de lumière temporaire.", shelterAction: "Écrire dans l'abri", noRank: "Ensemble face au temps, au climat et à la distance · aucun classement", compose: { terminator: "RELAIS DE L'AUBE", "region-choir": "CHŒUR RÉGIONAL", "night-watch": "VEILLE DE CONSTELLATION", "weather-shelter": "ABRI MÉTÉO" },
  },
  ja: {
    title: "いまの星潮", sample: "体験フロー・マルチユーザーデータ接続後は地域別に更新", ordinary: "いつもの空・まだ光はありません", bands: { quiet: "ささやき", glimmer: "きらめき", radiant: "輝き", surge: "星の潮" },
    signals: "のテキスト / 24H", recent: "いま点灯", global: "世界の共鳴", terminator: "朝夜リレー", terminatorCopy: "昼の一文を、まだ夜の空へ届けます。", sendAcross: "朝と夜を越えて書く", choir: "地域の星空合奏", choirCopy: "一人一文で、今日だけの星模様を作ります。", addVoice: "文字の星を加える", watch: "星座の見守り", watchCopy: "本当の文字リレーだけが光を延ばします。", relayNow: "書いて光を受け取る", shelter: "天気の光シェルター", shelterCopy: "雨雪や砂嵐の中、三つの言葉が光の屋根になります。", shelterAction: "シェルターへ書く", noRank: "時間・天気・距離と一緒に向き合う · 個人や地域の順位なし", compose: { terminator: "朝夜リレー", "region-choir": "地域の星空合奏", "night-watch": "星座の見守り", "weather-shelter": "天気の光シェルター" },
  },
};

const UI = {
  en: {
    drift: "Drift", nearby: "Near me", drop: "Drop a light", wish: "Make a wish", archive: "Star archive",
    locate: "Find my sky", soundOn: "Sound on", soundOff: "Sound off", original: "Original", translate: "Translate",
    reply: "Reply into this chain", hold: "Hold this light", region: "Sky conditions", source: "NASA Earth · Open-Meteo weather",
    drag: "drag to turn · pinch or use ± to zoom", live: "LIVE SKY", close: "Close", choose: "Choose a language",
    menu: "Hidden controls", routes: "Send it", cancel: "Cancel", message: "Write what is true right now…",
    response: "Write back gently…", wishText: "A small wish that someone could safely grant…", random: "Anywhere",
    near: "Near me", place: "Choose on Earth", selected: "Selected place", auto: "Your language will be detected and translated for the reader.",
    sent: "A new star has entered the sky.", locating: "Looking for your sky…", denied: "Location stays private. You can still choose anywhere on Earth.",
    nearbyTitle: "Lights near this sky", archiveTitle: "Constellations made by kindness", countries: "countries", stars: "stars",
    journeys: "journeys", rarity: ["common", "rare", "epic"], legacy: "Existing KindChain journey logic, now placed around the Earth.",
    menuItems: ["Weather wall", "Constellation paths", "Automatic translation", "Journey observatory", "Anonymous replies", "Wish signals"],
    privacy: "Exact personal locations are never shown. Nearby placement is softly blurred.",
    courier: "Choose a messenger", estimate: "route estimate", cinema: "Follow the journey", earthOn: "Show Earth", earthOff: "Hide Earth",
    inFlight: "in transit", distance: "distance", arrival: "estimated arrival", noJourneys: "No lights are travelling yet.",
  },
  zh: {
    drift: "随缘漂流", nearby: "看看附近", drop: "投放一束光", wish: "许一个愿望", archive: "星辰档案",
    locate: "找到我的天空", soundOn: "开启声音", soundOff: "关闭声音", original: "原文", translate: "自动翻译",
    reply: "接力回复", hold: "接住这束光", region: "此刻天空", source: "NASA 地球 · Open-Meteo 天气",
    drag: "拖动地球 · 双指或 ± 缩放", live: "实时天空", close: "关闭", choose: "选择语言",
    menu: "隐藏控制台", routes: "投放", cancel: "取消", message: "写下此刻真实的感受……",
    response: "温柔地回复一句……", wishText: "许一个具体、适度并可以安全实现的小愿望……", random: "随缘去任何地方",
    near: "投放在我附近", place: "选择地球上的地点", selected: "已选择地点", auto: "系统识别原语言，并为阅读者自动翻译。",
    sent: "一颗新星已经进入这片天空。", locating: "正在寻找你的天空……", denied: "你的位置仍然是私密的，也可以直接在地球上选择地点。",
    nearbyTitle: "这片天空附近的光", archiveTitle: "善意连成的星座", countries: "个国家", stars: "颗星",
    journeys: "条旅程", rarity: ["普通", "稀有", "史诗"], legacy: "保留 KindChain 现有的善意旅程逻辑，并把它放回真实地球。",
    menuItems: ["天气背景墙", "星座连接", "自动翻译", "旅程观测站", "匿名回复", "愿望信号"],
    privacy: "不会显示个人的精确位置；“附近”只使用经过模糊处理的区域。",
    courier: "选择送信方式", estimate: "路线估算", cinema: "跟随这段旅程", earthOn: "显示地球", earthOff: "隐藏地球",
    inFlight: "正在途中", distance: "距离", arrival: "预计抵达", noJourneys: "还没有正在旅行的光。",
  },
  es: {
    drift: "Derivar", nearby: "Cerca", drop: "Dejar luz", wish: "Pedir un deseo", archive: "Archivo estelar",
    locate: "Encontrar mi cielo", soundOn: "Sonido", soundOff: "Silencio", original: "Original", translate: "Traducir",
    reply: "Responder a la cadena", hold: "Guardar esta luz", region: "Cielo actual", source: "NASA Tierra · Open-Meteo",
    drag: "arrastra para girar · pellizca o usa ±", live: "CIELO EN VIVO", close: "Cerrar", choose: "Elegir idioma",
    menu: "Controles ocultos", routes: "Enviar", cancel: "Cancelar", message: "Escribe lo que es verdad ahora…",
    response: "Responde con cuidado…", wishText: "Un deseo pequeño y seguro…", random: "Cualquier lugar", near: "Cerca de mí",
    place: "Elegir en la Tierra", selected: "Lugar elegido", auto: "Detectamos el idioma y lo traducimos para cada lector.", sent: "Una nueva estrella entró en el cielo.",
    locating: "Buscando tu cielo…", denied: "Tu ubicación sigue privada. Puedes elegir un lugar en la Tierra.", nearbyTitle: "Luces cerca de este cielo",
    archiveTitle: "Constelaciones de bondad", countries: "países", stars: "estrellas", journeys: "viajes", rarity: ["común", "raro", "épico"],
    legacy: "La lógica actual de KindChain, ahora alrededor de la Tierra.", menuItems: ["Clima", "Constelaciones", "Traducción", "Entrega local", "Respuestas", "Deseos"],
    privacy: "Nunca mostramos ubicaciones personales exactas.",
    courier: "Elegir mensajero", estimate: "ruta estimada", cinema: "Seguir el viaje", earthOn: "Mostrar Tierra", earthOff: "Ocultar Tierra", inFlight: "en tránsito", distance: "distancia", arrival: "llegada estimada", noJourneys: "Aún no hay luces viajando.",
  },
  fr: {
    drift: "Dériver", nearby: "À proximité", drop: "Déposer une lumière", wish: "Faire un vœu", archive: "Archives",
    locate: "Trouver mon ciel", soundOn: "Son", soundOff: "Silence", original: "Original", translate: "Traduire",
    reply: "Répondre à la chaîne", hold: "Garder cette lumière", region: "Ciel actuel", source: "NASA Terre · Open-Meteo",
    drag: "glisser pour tourner · pincer ou utiliser ±", live: "CIEL EN DIRECT", close: "Fermer", choose: "Choisir la langue",
    menu: "Commandes cachées", routes: "Envoyer", cancel: "Annuler", message: "Écrivez ce qui est vrai maintenant…",
    response: "Répondez doucement…", wishText: "Un petit vœu sûr…", random: "N'importe où", near: "Près de moi",
    place: "Choisir sur Terre", selected: "Lieu choisi", auto: "La langue est détectée et traduite pour le lecteur.", sent: "Une nouvelle étoile est entrée dans le ciel.",
    locating: "Recherche de votre ciel…", denied: "Votre position reste privée. Choisissez un lieu sur Terre.", nearbyTitle: "Lumières près de ce ciel",
    archiveTitle: "Constellations de bonté", countries: "pays", stars: "étoiles", journeys: "voyages", rarity: ["commun", "rare", "épique"],
    legacy: "La logique KindChain existante, replacée autour de la Terre.", menuItems: ["Météo", "Constellations", "Traduction", "Envoi local", "Réponses", "Vœux"],
    privacy: "Les positions personnelles exactes ne sont jamais affichées.",
    courier: "Choisir le messager", estimate: "trajet estimé", cinema: "Suivre le voyage", earthOn: "Voir la Terre", earthOff: "Masquer la Terre", inFlight: "en route", distance: "distance", arrival: "arrivée estimée", noJourneys: "Aucune lumière ne voyage encore.",
  },
  ja: {
    drift: "漂う", nearby: "近くの光", drop: "光を置く", wish: "願いごと", archive: "星の記録",
    locate: "私の空", soundOn: "音をオン", soundOff: "音をオフ", original: "原文", translate: "翻訳",
    reply: "この光に返信", hold: "この光を受け取る", region: "今の空", source: "NASA Earth · Open-Meteo",
    drag: "ドラッグで回転 · ピンチまたは±で拡大", live: "ライブスカイ", close: "閉じる", choose: "言語を選択",
    menu: "隠れた操作", routes: "送る", cancel: "キャンセル", message: "今、本当に感じていることを…",
    response: "やさしく返信する…", wishText: "安全に叶えられる小さな願い…", random: "どこかへ", near: "私の近く",
    place: "地球上で選ぶ", selected: "選んだ場所", auto: "言語を検出し、読む人の言語に翻訳します。", sent: "新しい星が空に生まれました。",
    locating: "あなたの空を探しています…", denied: "位置情報は非公開のままです。地球上から選べます。", nearbyTitle: "この空の近くの光",
    archiveTitle: "やさしさが作った星座", countries: "か国", stars: "個の星", journeys: "の旅", rarity: ["コモン", "レア", "エピック"],
    legacy: "現在のKindChainの旅を、地球上に再配置しました。", menuItems: ["天気の壁", "星座", "自動翻訳", "地域配信", "匿名返信", "願い"],
    privacy: "正確な個人位置は表示されません。",
    courier: "届け方を選ぶ", estimate: "推定ルート", cinema: "旅を追いかける", earthOn: "地球を表示", earthOff: "地球を隠す", inFlight: "移動中", distance: "距離", arrival: "到着予定", noJourneys: "旅をしている光はまだありません。",
  },
} as const;

const LOCALE_NAMES: Record<Locale, string> = { en: "English", zh: "中文", es: "Español", fr: "Français", ja: "日本語" };

const TRANSPORTS: Record<CourierMode, {
  glyph: string; names: Record<Locale, string>; era: Record<Locale, string>; speed: number; routeFactor: number; handling: number; color: number;
}> = {
  hand: { glyph: "人", names: { en: "On foot", zh: "人工步行", es: "A pie", fr: "À pied", ja: "人の手" }, era: { en: "the first road", zh: "最初的道路", es: "el primer camino", fr: "la première route", ja: "最初の道" }, speed: 4.8, routeFactor: 1.28, handling: .2, color: 0xf1c69c },
  pigeon: { glyph: "◇", names: { en: "Homing pigeon", zh: "信鸽", es: "Paloma mensajera", fr: "Pigeon voyageur", ja: "伝書鳩" }, era: { en: "wind & instinct", zh: "风与本能", es: "viento e instinto", fr: "vent et instinct", ja: "風と本能" }, speed: 72, routeFactor: 1.06, handling: .5, color: 0xe7edf4 },
  carriage: { glyph: "◉", names: { en: "Mail carriage", zh: "邮驿马车", es: "Coche de correo", fr: "Malle-poste", ja: "郵便馬車" }, era: { en: "lantern roads", zh: "提灯照亮的驿道", es: "caminos de farol", fr: "routes aux lanternes", ja: "ランタンの街道" }, speed: 13, routeFactor: 1.35, handling: 1.5, color: 0xd9a260 },
  rail: { glyph: "▰", names: { en: "Night mail train", zh: "夜行邮政列车", es: "Tren postal", fr: "Train postal", ja: "夜行郵便列車" }, era: { en: "iron & midnight", zh: "钢铁与午夜", es: "hierro y medianoche", fr: "fer et minuit", ja: "鉄と真夜中" }, speed: 105, routeFactor: 1.22, handling: 2, color: 0xc68e61 },
  plane: { glyph: "✈", names: { en: "Airmail", zh: "航空邮件", es: "Correo aéreo", fr: "Poste aérienne", ja: "航空便" }, era: { en: "above the weather", zh: "飞越天气", es: "sobre el clima", fr: "au-dessus du temps", ja: "雲の上" }, speed: 820, routeFactor: 1.08, handling: 4, color: 0x9ec9e8 },
  rocket: { glyph: "↑", names: { en: "Orbital rocket", zh: "轨道火箭", es: "Cohete orbital", fr: "Fusée orbitale", ja: "軌道ロケット" }, era: { en: "edge of Earth", zh: "掠过地球边缘", es: "borde de la Tierra", fr: "lisière de la Terre", ja: "地球の縁" }, speed: 27000, routeFactor: 1.42, handling: 8, color: 0xffb16f },
  starship: { glyph: "✦", names: { en: "Kindship", zh: "星际飞船", es: "Nave Kindship", fr: "Vaisseau Kindship", ja: "星間船" }, era: { en: "a future route", zh: "来自未来的航线", es: "una ruta futura", fr: "une route future", ja: "未来の航路" }, speed: 46000, routeFactor: 1.6, handling: .3, color: 0xb99cff },
};

const TRANSPORT_ORDER = Object.keys(TRANSPORTS) as CourierMode[];

const COURIER_ASSETS: Partial<Record<CourierMode, string[]>> = {
  hand: ["https://static.poly.pizza/3746be88-6799-4817-929b-6bc067c47caa.glb"],
  pigeon: ["https://static.poly.pizza/dc872849-2253-41b7-b0bd-9138ad555ddc.glb"],
  carriage: ["https://static.poly.pizza/d37dbc87-ca61-4b2c-a2da-d2f0c4240bef.glb", "https://static.poly.pizza/94b32c91-4d46-4172-aadd-10176a4eb543.glb"],
  rail: ["https://static.poly.pizza/1f7946e4-dc66-42b2-b493-c3542bb5ba8a.glb"],
  rocket: ["https://static.poly.pizza/244c027c-40f0-45ca-a707-0f8e855c9831.glb"],
  starship: ["https://static.poly.pizza/0843ab59-1800-4d96-9cc7-b4d6afbecf21.glb"],
};

const INITIAL_STORIES: Story[] = [
  {
    id: "ca-1", chain: "aurora", lat: 53.55, lon: -113.49, region: "Edmonton", country: "Canada", lang: "en",
    text: "I made it through today. That is all I have, but it is something.", kind: "light",
    translations: { zh: "我熬过了今天。虽然我只有这么多，但这本身已经是一件事。", es: "Logré superar el día. Es todo lo que tengo, pero es algo.", fr: "J'ai traversé cette journée. C'est tout ce que j'ai, mais c'est déjà quelque chose.", ja: "今日をなんとか越えた。それだけだけど、それでも意味はある。" },
    replies: [
      { id: "r1", lang: "ja", text: "今日を越えたあなたに、静かな拍手を送ります。", translations: { en: "A quiet round of applause for making it through today.", zh: "为熬过今天的你，送上一阵安静的掌声。" } },
      { id: "r2", lang: "fr", text: "Je suis heureux que tu sois encore ici.", translations: { en: "I am glad you are still here.", zh: "我很高兴你仍然在这里。" } },
    ],
  },
  {
    id: "kr-1", chain: "aurora", lat: 37.57, lon: 126.98, region: "Seoul", country: "Korea", lang: "en",
    text: "오늘 아무것도 해내지 못했어도, 살아낸 것만으로 충분해요.",
    translations: { en: "Even if you accomplished nothing today, surviving it was enough.", zh: "即使今天什么都没有完成，能够熬过来就已经足够。", es: "Aunque hoy no hayas logrado nada, sobrevivir fue suficiente.", fr: "Même si tu n'as rien accompli aujourd'hui, avoir tenu bon suffit.", ja: "今日何もできなかったとしても、生き抜いただけで十分です。" },
    replies: [{ id: "r3", lang: "es", text: "Gracias. Necesitaba leer esto esta noche.", translations: { en: "Thank you. I needed to read this tonight.", zh: "谢谢你，今晚我正需要读到这句话。" } }],
  },
  {
    id: "mx-1", chain: "aurora", lat: 19.43, lon: -99.13, region: "Ciudad de México", country: "Mexico", lang: "es",
    text: "No necesito consejos. Solo necesito que alguien sepa que lo estoy intentando.",
    translations: { en: "I do not need advice. I just need someone to know I am trying.", zh: "我不需要建议，只希望有人知道我真的在努力。", fr: "Je n'ai pas besoin de conseils. J'ai seulement besoin que quelqu'un sache que j'essaie.", ja: "アドバイスはいらない。ただ、頑張っていることを誰かに知ってほしい。" },
    replies: [{ id: "r4", lang: "en", text: "I see the effort. You do not have to prove it here.", translations: { zh: "我看见你的努力了。在这里，你不需要证明什么。", es: "Veo tu esfuerzo. Aquí no tienes que demostrar nada." } }],
  },
  {
    id: "ke-1", chain: "aurora", lat: -1.29, lon: 36.82, region: "Nairobi", country: "Kenya", lang: "en",
    text: "The version of you that is tired is still worthy of tenderness.",
    translations: { zh: "那个疲惫的你，依然值得被温柔对待。", es: "La versión cansada de ti también merece ternura.", fr: "La version fatiguée de toi mérite toujours de la tendresse.", ja: "疲れているあなたも、やさしくされる価値がある。" }, replies: [],
  },
  {
    id: "jp-1", chain: "moon-thread", lat: 43.06, lon: 141.35, region: "Sapporo", country: "Japan", lang: "ja",
    text: "雪の朝は静かすぎて寂しい。でも、どこかの誰かも同じ空を見ていると思いたい。",
    translations: { en: "Snowy mornings are so quiet they feel lonely. I want to believe someone somewhere is looking at the same sky.", zh: "雪天的清晨安静得让人孤独。我愿意相信，某个地方也有人望着同一片天空。", es: "Las mañanas de nieve son tan silenciosas que dan soledad. Quiero creer que alguien mira el mismo cielo.", fr: "Les matins de neige sont si silencieux qu'ils semblent solitaires. Je veux croire que quelqu'un regarde le même ciel." }, replies: [],
  },
  {
    id: "fr-1", chain: "moon-thread", lat: 45.76, lon: 4.84, region: "Lyon", country: "France", lang: "fr",
    text: "J'aimerais recevoir une carte postale pour mon anniversaire. Rien de grand, juste une preuve que le monde m'a vu.", kind: "wish",
    translations: { en: "I would love a postcard for my birthday. Nothing big—just proof that the world saw me.", zh: "生日时，我想收到一张明信片。不需要贵重，只想知道世界曾经看见我。", es: "Me gustaría recibir una postal por mi cumpleaños. Nada grande, solo una prueba de que el mundo me vio.", ja: "誕生日にポストカードがほしい。大きなものではなく、世界が私を見つけてくれた証として。" }, replies: [],
  },
  {
    id: "au-1", chain: "moon-thread", lat: -33.87, lon: 151.21, region: "Sydney", country: "Australia", lang: "en",
    text: "The sun is rising here. I can lend you a little morning until yours arrives.",
    translations: { zh: "我这里太阳正在升起。在你的清晨到来之前，我可以先借给你一点光。", es: "Aquí está amaneciendo. Puedo prestarte un poco de mañana hasta que llegue la tuya.", fr: "Le soleil se lève ici. Je peux te prêter un peu de matin jusqu'à ce que le tien arrive.", ja: "こちらでは朝日が昇っています。あなたの朝が来るまで、少しだけ光を貸します。" }, replies: [],
  },
  {
    id: "br-1", chain: "ember", lat: -23.55, lon: -46.63, region: "São Paulo", country: "Brazil", lang: "es",
    text: "Hoje foi pesado. Deixo aqui uma pequena esperança para quem passar depois de mim.",
    translations: { en: "Today was heavy. I am leaving a small hope here for whoever passes after me.", zh: "今天很沉重。我在这里留下一点希望，给下一个经过的人。", fr: "Aujourd'hui était lourd. Je laisse ici un peu d'espoir pour la prochaine personne.", ja: "今日は重い一日だった。次にここを通る人へ、小さな希望を置いていきます。" }, replies: [],
  },
];

// Explicitly marked experience data so the visual system can be felt before a
// real multi-user activity feed is connected. Local text events are merged in
// immediately; unlocated events never invent a region.
const DEMO_ACTIVITY_SEED = [
  { cellId: "demo-edmonton", centroidLat: 53.55, centroidLon: -113.49, regionLabel: "Edmonton", uniquePublishers: 14, textCount: 19, lightCount: 12, wishCount: 2, replyCount: 5, recentCount: 3, ageMinutes: 2 },
  { cellId: "demo-seoul", centroidLat: 37.57, centroidLon: 126.98, regionLabel: "Seoul", uniquePublishers: 27, textCount: 35, lightCount: 20, wishCount: 4, replyCount: 11, recentCount: 6, ageMinutes: 1 },
  { cellId: "demo-mexico", centroidLat: 19.43, centroidLon: -99.13, regionLabel: "Ciudad de México", uniquePublishers: 8, textCount: 11, lightCount: 7, wishCount: 1, replyCount: 3, recentCount: 1, ageMinutes: 9 },
  { cellId: "demo-nairobi", centroidLat: -1.29, centroidLon: 36.82, regionLabel: "Nairobi", uniquePublishers: 1, textCount: 1, lightCount: 1, wishCount: 0, replyCount: 0, recentCount: 0, ageMinutes: 188 },
  { cellId: "demo-sapporo", centroidLat: 43.06, centroidLon: 141.35, regionLabel: "Sapporo", uniquePublishers: 4, textCount: 6, lightCount: 4, wishCount: 1, replyCount: 1, recentCount: 1, ageMinutes: 12 },
  { cellId: "demo-lyon", centroidLat: 45.76, centroidLon: 4.84, regionLabel: "Lyon", uniquePublishers: 2, textCount: 3, lightCount: 1, wishCount: 1, replyCount: 1, recentCount: 0, ageMinutes: 74 },
  { cellId: "demo-sydney", centroidLat: -33.87, centroidLon: 151.21, regionLabel: "Sydney", uniquePublishers: 12, textCount: 16, lightCount: 10, wishCount: 1, replyCount: 5, recentCount: 2, ageMinutes: 5 },
  { cellId: "demo-sao-paulo", centroidLat: -23.55, centroidLon: -46.63, regionLabel: "São Paulo", uniquePublishers: 6, textCount: 8, lightCount: 5, wishCount: 1, replyCount: 2, recentCount: 0, ageMinutes: 41 },
] as const;

const COLOR_BY_CHAIN: Record<string, number> = { aurora: 0xbda2ff, "moon-thread": 0xffd99d, ember: 0xff9f81, new: 0x8de6d0 };

function chainColor(chain: string) {
  if (COLOR_BY_CHAIN[chain]) return COLOR_BY_CHAIN[chain];
  const hue = stableHash(chain) % 360;
  const saturation = 58 + (stableHash(`${chain}-s`) % 17);
  const lightness = 68 + (stableHash(`${chain}-l`) % 12);
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (Math.round(channel(0) * 255) << 16) | (Math.round(channel(8) * 255) << 8) | Math.round(channel(4) * 255);
}

function latLonVector(THREE: ThreeModule, lat: number, lon: number, radius = 2.22) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.cos(theta),
  );
}

function vectorLatLon(vector: import("three").Vector3) {
  const unit = vector.clone().normalize();
  return {
    lat: 90 - Math.acos(unit.y) * 180 / Math.PI,
    lon: Math.atan2(unit.x, unit.z) * 180 / Math.PI,
  };
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createLocalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function activityIntensity(uniquePublishers: number) {
  if (uniquePublishers <= 0) return 0;
  const q = Math.min(1, Math.log1p(uniquePublishers) / Math.log1p(128));
  const eased = q * q * (3 - 2 * q);
  const privacyFactor = uniquePublishers === 1 ? .65 : uniquePublishers === 2 ? .82 : 1;
  return privacyFactor * (.06 + .94 * eased);
}

function activityBand(intensity: number): ActivityBand {
  if (intensity < .14) return "quiet";
  if (intensity < .38) return "glimmer";
  if (intensity < .76) return "radiant";
  return "surge";
}

function activityOriginFor(point: { lat: number; lon: number }, label: string): ActivityOrigin {
  const latStep = 2.5;
  const lonStep = 2.5;
  const latIndex = Math.floor((point.lat + 90) / latStep);
  const lonIndex = Math.floor((point.lon + 180) / lonStep);
  return {
    cellId: `cell-${latIndex}-${lonIndex}`,
    centroidLat: Math.max(-88.75, Math.min(88.75, latIndex * latStep - 90 + latStep / 2)),
    centroidLon: lonIndex * lonStep - 180 + lonStep / 2,
    regionLabel: label,
  };
}

function buildDailyActivity(stories: Story[], current: number): DailyActivitySnapshot {
  type MutableCell = { cell: DailyRegionActivity; authors: Set<string> };
  const cells = new Map<string, MutableCell>();
  const rollingStart = current - 24 * 3600000;
  let globalUnlocated = 0;

  DEMO_ACTIVITY_SEED.forEach((seed) => {
    const intensity = activityIntensity(seed.uniquePublishers);
    const authors = new Set<string>();
    for (let i = 0; i < seed.uniquePublishers; i++) authors.add(`sample-${seed.cellId}-${i}`);
    cells.set(seed.cellId, {
      authors,
      cell: {
        cellId: seed.cellId,
        centroidLat: seed.centroidLat,
        centroidLon: seed.centroidLon,
        regionLabel: seed.regionLabel,
        uniquePublishers: seed.uniquePublishers,
        textCount: seed.textCount,
        lightCount: seed.lightCount,
        wishCount: seed.wishCount,
        replyCount: seed.replyCount,
        recentCount: seed.recentCount,
        lastPublishedAt: current - seed.ageMinutes * 60000,
        intensity,
        band: activityBand(intensity),
        sample: true,
      },
    });
  });

  const addEvent = (origin: ActivityOrigin | undefined, authorKey: string | undefined, id: string, kind: "light" | "wish" | "reply", createdAt: number | undefined) => {
    if (!createdAt || createdAt < rollingStart || createdAt > current + 60000) return;
    if (!origin) { globalUnlocated += 1; return; }
    let entry = cells.get(origin.cellId);
    if (!entry) {
      entry = {
        authors: new Set<string>(),
        cell: {
          cellId: origin.cellId,
          centroidLat: origin.centroidLat,
          centroidLon: origin.centroidLon,
          regionLabel: origin.regionLabel,
          uniquePublishers: 0,
          textCount: 0,
          lightCount: 0,
          wishCount: 0,
          replyCount: 0,
          recentCount: 0,
          lastPublishedAt: createdAt,
          intensity: 0,
          band: "quiet",
          sample: false,
        },
      };
      cells.set(origin.cellId, entry);
    }
    entry.authors.add(authorKey || id);
    entry.cell.textCount += 1;
    if (kind === "reply") entry.cell.replyCount += 1;
    else if (kind === "wish") entry.cell.wishCount += 1;
    else entry.cell.lightCount += 1;
    if (current - createdAt <= 15 * 60000) entry.cell.recentCount += 1;
    entry.cell.lastPublishedAt = Math.max(entry.cell.lastPublishedAt, createdAt);
  };

  stories.forEach((story) => {
    addEvent(story.origin, story.authorDayKey, story.id, story.kind === "wish" ? "wish" : "light", story.createdAt);
    story.replies.forEach((reply) => addEvent(reply.origin, reply.authorDayKey, reply.id, "reply", reply.createdAt));
  });

  const resolved = [...cells.values()].map(({ cell, authors }) => {
    const uniquePublishers = authors.size;
    const intensity = activityIntensity(uniquePublishers);
    return { ...cell, uniquePublishers, intensity, band: activityBand(intensity) };
  }).sort((a, b) => b.intensity - a.intensity || a.cellId.localeCompare(b.cellId));
  const signature = resolved.map((cell) => `${cell.cellId}:${cell.uniquePublishers}:${cell.textCount}:${cell.recentCount}`).join("|");
  return { version: stableHash(signature).toString(36), generatedAt: current, cells: resolved, globalUnlocated };
}

function rasterizeActivityMap(snapshot: DailyActivitySnapshot, width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  const merge = (oldValue: number, contribution: number) => Math.round(255 * (1 - (1 - oldValue / 255) * (1 - Math.max(0, Math.min(1, contribution)))));
  snapshot.cells.forEach((cell) => {
    if (cell.intensity <= 0) return;
    const centerX = ((cell.centroidLon + 180) / 360) * width;
    const centerY = ((cell.centroidLat + 90) / 180) * height;
    const radiusY = 2.2 + cell.intensity * 4.6;
    const radiusX = Math.min(12, radiusY / Math.max(.42, Math.cos(cell.centroidLat * Math.PI / 180)));
    const wishRatio = cell.textCount ? cell.wishCount / cell.textCount : 0;
    const replyRatio = cell.textCount ? cell.replyCount / cell.textCount : 0;
    const freshness = Math.min(1, cell.recentCount / Math.max(1, Math.min(5, cell.uniquePublishers)));
    const minX = Math.floor(centerX - radiusX * 2.25);
    const maxX = Math.ceil(centerX + radiusX * 2.25);
    const minY = Math.max(0, Math.floor(centerY - radiusY * 2.25));
    const maxY = Math.min(height - 1, Math.ceil(centerY + radiusY * 2.25));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = (x - centerX) / radiusX;
        const dy = (y - centerY) / radiusY;
        const gaussian = Math.exp(-(dx * dx + dy * dy) * 1.75);
        if (gaussian < .012) continue;
        const wrappedX = ((x % width) + width) % width;
        const index = (y * width + wrappedX) * 4;
        data[index] = merge(data[index], cell.intensity * gaussian);
        data[index + 1] = merge(data[index + 1], wishRatio * gaussian);
        data[index + 2] = merge(data[index + 2], replyRatio * gaussian);
        data[index + 3] = merge(data[index + 3], freshness * gaussian);
      }
    }
  });
  return data;
}

function createActivityTexture(THREE: ThreeModule, snapshot: DailyActivitySnapshot, width: number) {
  const height = width / 2;
  const texture = new THREE.DataTexture(rasterizeActivityMap(snapshot, width, height), width, height, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function subsolarPoint(date = new Date()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86400000);
  const declination = 23.44 * Math.sin((Math.PI * 2 * (day - 80)) / 365.2422);
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lon = 180 - utcHours * 15;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat: declination, lon };
}

function solarPhaseAt(lat: number, lon: number, date = new Date()): TimePhase {
  const solar = subsolarPoint(date);
  const toRad = Math.PI / 180;
  const solarDot = Math.sin(lat * toRad) * Math.sin(solar.lat * toRad)
    + Math.cos(lat * toRad) * Math.cos(solar.lat * toRad) * Math.cos((lon - solar.lon) * toRad);
  const altitude = Math.asin(Math.max(-1, Math.min(1, solarDot))) / toRad;
  if (altitude > 6) return "day";
  if (altitude < -6) return "night";
  const hourAngle = ((lon - solar.lon + 540) % 360) - 180;
  return hourAngle < 0 ? "dawn" : "dusk";
}

function zoneFor(lat: number, lon: number): RegionZone {
  if (Math.abs(lat) >= 66) return "arctic";
  if (inBox(lat, lon, 7, 52, 92, 150)) return "east-asia";
  if (inBox(lat, lon, 29, 47, -10, 40)) return "mediterranean";
  if (inBox(lat, lon, -22, 18, 20, 52)) return "savanna";
  if (inBox(lat, lon, 12, 38, -18, 66) || inBox(lat, lon, -35, -17, 113, 146)) return "desert-belt";
  if (Math.abs(lat) < 24 && (Math.abs(lon) > 70 || Math.abs(lon) < 45)) return "tropical-isles";
  if (inBox(lat, lon, -56, 12, -82, -62)) return "andes";
  if (inBox(lat, lon, 40, 70, -145, -50)) return "northern-lakes";
  return "open-ocean";
}

function routeScene(journey: Journey, progress: number) {
  const lonDelta = ((journey.to.lon - journey.from.lon + 540) % 360) - 180;
  const lat = journey.from.lat + (journey.to.lat - journey.from.lat) * progress;
  let lon = journey.from.lon + lonDelta * progress;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  const localHour = (new Date().getUTCHours() + new Date().getUTCMinutes() / 60 + lon / 15 + 24) % 24;
  const time: TimePhase = localHour < 5.5 || localHour >= 20 ? "night" : localHour < 8 ? "dawn" : localHour >= 17.5 ? "dusk" : "day";
  const zone = zoneFor(lat, lon);
  const biome: Biome = zone === "arctic" ? "polar" : zone === "desert-belt" ? "desert" : zone === "tropical-isles" || zone === "savanna" ? "tropical" : zone === "andes" ? "mountain" : zone === "open-ocean" ? "coastal" : Math.abs(lat) > 50 ? "boreal" : "temperate";
  const weather: WeatherKind = biome === "polar" ? "snow" : biome === "tropical" && stableHash(`${journey.id}-${Math.floor(progress * 5)}`) % 3 === 0 ? "rain" : zone === "open-ocean" && stableHash(journey.id) % 2 === 0 ? "fog" : "clear";
  const hazard: Hazard = biome === "desert" && stableHash(`${journey.id}-dust`) % 3 === 0 ? "dust" : biome === "polar" ? "ice" : "none";
  return { lat, lon, localHour, time, zone, biome, weather, hazard };
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function lifeAlpha(expiresAt?: number, current = Date.now()) {
  if (!expiresAt) return 1;
  const remaining = expiresAt - current;
  if (remaining <= 0) return 0;
  if (remaining >= 600000) return 1;
  const x = remaining / 600000;
  return x * x * (3 - 2 * x);
}

function detectTextLocale(text: string): Locale | "auto" {
  if (/[ぁ-ゟ゠-ヿ]/u.test(text)) return "ja";
  if (/\p{Script=Han}/u.test(text)) return "zh";
  if (/[¿¡ñáéíóúü]/iu.test(text) || /\b(hola|gracias|quiero|estoy|para|pero|una|que)\b/iu.test(text)) return "es";
  if (/[àâçèéêëîïôûùüÿœ]/iu.test(text) || /\b(merci|bonjour|avec|pour|mais|une|je|suis)\b/iu.test(text)) return "fr";
  if (/^[\p{Script=Latin}\p{Number}\p{Punctuation}\p{Separator}]+$/u.test(text)) return "en";
  return "auto";
}

function miniConstellationLayout(stories: Story[]) {
  const points: { id: string; x: number; y: number; parent: string | null; root: boolean }[] = [];
  stories.forEach((story, storyIndex) => {
    const hash = stableHash(story.id);
    points.push({ id: story.id, x: 13 + hash % 74, y: 15 + (hash >>> 9) % 68, parent: storyIndex ? stories[storyIndex - 1].id : null, root: true });
    story.replies.forEach((reply) => {
      const replyHash = stableHash(reply.id);
      points.push({ id: reply.id, x: 10 + replyHash % 80, y: 12 + (replyHash >>> 9) % 74, parent: story.id, root: false });
    });
  });
  const byId = new Map(points.map((point) => [point.id, point]));
  return {
    points,
    edges: points.flatMap((point) => point.parent && byId.get(point.parent) ? [{ from: byId.get(point.parent)!, to: point, reply: !point.root }] : []),
  };
}

function constellationName(chain: string, locale: Locale) {
  if (!chain.startsWith("path-")) return chain.replaceAll("-", " ");
  const index = stableHash(chain) % 6;
  const names: Record<Locale, string[]> = {
    zh: ["晨羽星途", "微光渡口", "远方来信", "温柔航线", "月下回声", "星河接力"],
    en: ["Dawnfeather Path", "Harbour of Light", "A Letter Afar", "Tender Orbit", "Moonlit Echo", "Starlight Relay"],
    es: ["Ruta Pluma del Alba", "Puerto de Luz", "Carta Lejana", "Órbita Amable", "Eco Lunar", "Relevo Estelar"],
    fr: ["Route Plume d'Aube", "Port de Lumière", "Lettre Lointaine", "Orbite Tendre", "Écho Lunaire", "Relais d'Étoiles"],
    ja: ["暁羽の星路", "微光の港", "遠い手紙", "やさしい軌道", "月夜のこだま", "星明かりのリレー"],
  };
  return `${names[locale][index]} · ${chain.slice(-4).toUpperCase()}`;
}

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = 6371;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const v = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(v));
}

function estimateRoute(mode: CourierMode, from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const direct = distanceKm(from, to);
  const spec = TRANSPORTS[mode];
  const routeDistance = direct * spec.routeFactor;
  return { distance: direct, routeDistance, etaHours: routeDistance / spec.speed + spec.handling };
}

function formatDuration(hours: number, locale: Locale) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`;
  const days = hours / 24;
  return locale === "zh" ? `${days < 10 ? days.toFixed(1) : Math.round(days)} 天` : `${days < 10 ? days.toFixed(1) : Math.round(days)} d`;
}

function journeyProgress(journey: Journey) {
  return Math.min(1, Math.max(.025, (Date.now() - journey.startedAt) / journey.demoDurationMs));
}

function createCourierModel(THREE: ThreeModule, mode: CourierMode, color: number) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: .42, metalness: mode === "rail" || mode === "plane" || mode === "rocket" || mode === "starship" ? .58 : .08 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171522, roughness: .7, metalness: .2 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .58, blending: THREE.AdditiveBlending });
  const add = (geometry: import("three").BufferGeometry, material: import("three").Material = bodyMaterial, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  if (mode === "hand") {
    add(new THREE.SphereGeometry(.07, 14, 14), bodyMaterial, .08, .1, 0);
    const coat = add(new THREE.CapsuleGeometry(.075, .18, 5, 10), bodyMaterial, .02, -.06, 0);
    coat.rotation.z = -.18;
    const satchel = add(new THREE.BoxGeometry(.09, .075, .04), dark, -.08, -.03, .065);
    satchel.rotation.z = .15;
    add(new THREE.CylinderGeometry(.025, .025, .16, 8), dark, -.02, -.22, 0).rotation.z = -.18;
    add(new THREE.CylinderGeometry(.025, .025, .16, 8), dark, .09, -.21, 0).rotation.z = .22;
  } else if (mode === "pigeon") {
    const body = add(new THREE.SphereGeometry(.095, 20, 14)); body.scale.set(1.55, .7, .68);
    add(new THREE.SphereGeometry(.055, 16, 12), bodyMaterial, .13, .035, 0);
    const beak = add(new THREE.ConeGeometry(.025, .08, 8), new THREE.MeshStandardMaterial({ color: 0xe0ad64 }), .2, .035, 0); beak.rotation.z = -Math.PI / 2;
    const wingGeo = new THREE.ConeGeometry(.085, .25, 3);
    const wingA = add(wingGeo, bodyMaterial, -.02, .02, .08); wingA.rotation.set(1.2, 0, .72); wingA.userData.wing = 1;
    const wingB = add(wingGeo.clone(), bodyMaterial, -.02, .02, -.08); wingB.rotation.set(-1.2, 0, .72); wingB.userData.wing = -1;
  } else if (mode === "carriage") {
    add(new THREE.BoxGeometry(.24, .13, .15), bodyMaterial, .06, .03, 0);
    add(new THREE.BoxGeometry(.08, .11, .13), dark, -.1, .02, 0);
    [-.07, .14].forEach((x) => [-.09, .09].forEach((z) => { const wheel = add(new THREE.TorusGeometry(.052, .012, 8, 18), dark, x, -.065, z); wheel.rotation.y = Math.PI / 2; }));
    const horse = add(new THREE.CapsuleGeometry(.045, .14, 4, 8), bodyMaterial, -.26, -.005, 0); horse.rotation.z = Math.PI / 2;
    add(new THREE.SphereGeometry(.05, 12, 10), bodyMaterial, -.35, .06, 0);
  } else if (mode === "rail") {
    add(new THREE.BoxGeometry(.34, .12, .14), bodyMaterial, 0, 0, 0);
    add(new THREE.BoxGeometry(.12, .16, .13), dark, .06, .08, 0);
    const boiler = add(new THREE.CylinderGeometry(.06, .06, .21, 18), bodyMaterial, -.11, .07, 0); boiler.rotation.z = Math.PI / 2;
    [-.12, .02, .13].forEach((x) => [-.08, .08].forEach((z) => { const wheel = add(new THREE.TorusGeometry(.045, .013, 8, 16), dark, x, -.075, z); wheel.rotation.y = Math.PI / 2; }));
  } else if (mode === "plane") {
    const fuselage = add(new THREE.CapsuleGeometry(.045, .31, 6, 12)); fuselage.rotation.z = Math.PI / 2;
    const wing = add(new THREE.BoxGeometry(.15, .018, .46), bodyMaterial, 0, 0, 0); wing.rotation.y = -.08;
    add(new THREE.BoxGeometry(.09, .015, .17), bodyMaterial, .16, .035, 0);
  } else if (mode === "rocket") {
    const body = add(new THREE.CylinderGeometry(.055, .068, .26, 18)); body.rotation.z = -Math.PI / 2;
    const nose = add(new THREE.ConeGeometry(.056, .12, 18), bodyMaterial, .19, 0, 0); nose.rotation.z = -Math.PI / 2;
    add(new THREE.ConeGeometry(.06, .18, 18), glowMaterial, -.22, 0, 0).rotation.z = Math.PI / 2;
    add(new THREE.BoxGeometry(.1, .13, .018), bodyMaterial, -.09, 0, 0).rotation.z = .48;
  } else {
    const hull = add(new THREE.SphereGeometry(.11, 24, 14)); hull.scale.set(1.85, .42, 1);
    const canopy = add(new THREE.SphereGeometry(.065, 18, 12), new THREE.MeshStandardMaterial({ color: 0xacc8e6, transparent: true, opacity: .72, roughness: .1, metalness: .15 }), .04, .055, 0); canopy.scale.set(1.1, .55, .8);
    const ring = add(new THREE.TorusGeometry(.13, .018, 10, 28), glowMaterial); ring.rotation.x = Math.PI / 2;
  }
  group.rotation.y = -Math.PI / 2;
  return group;
}

function inBox(lat: number, lon: number, south: number, north: number, west: number, east: number) {
  return lat >= south && lat <= north && lon >= west && lon <= east;
}

function inferBiome(lat: number, lon: number, weather: Weather): Biome {
  const absLat = Math.abs(lat);
  if (absLat >= 66 || weather.temperature <= -18) return "polar";
  const desert = inBox(lat, lon, 14, 34, -18, 36)
    || inBox(lat, lon, 12, 33, 35, 61)
    || inBox(lat, lon, 34, 48, 74, 116)
    || inBox(lat, lon, -36, -17, 113, 146)
    || inBox(lat, lon, 24, 39, -121, -100)
    || inBox(lat, lon, -31, -16, -76, -65);
  if (desert || (weather.humidity < 28 && weather.soilMoisture < .12 && weather.temperature > 22)) return "desert";
  if (absLat < 24 && weather.humidity >= 62) return "tropical";
  if (absLat >= 48) return "boreal";
  const coastal = Math.abs(lon) < 6 || Math.abs(Math.abs(lon) - 180) < 5 || weather.humidity > 84;
  if (coastal) return "coastal";
  if (absLat > 27 && weather.temperature < 8 && weather.visibility > 14000) return "mountain";
  return "temperate";
}

function resolveEnvironment(weather: Weather, lat: number, lon: number, auroraChance: number): Environment {
  const biome = inferBiome(lat, lon, weather);
  const time: TimePhase = !weather.isDay ? "night" : weather.localHour < 8 ? "dawn" : weather.localHour >= 17 ? "dusk" : "day";
  let weatherKind: WeatherKind = weather.cloud > 72 ? "cloud" : "clear";
  if ([95, 96, 99].includes(weather.code)) weatherKind = "storm";
  else if ([71, 73, 75, 77, 85, 86].includes(weather.code)) weatherKind = "snow";
  else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weather.code) || weather.precipitation > 0) weatherKind = "rain";
  else if ([45, 48].includes(weather.code) || weather.visibility < 2500) weatherKind = "fog";
  let hazard: Hazard = "none";
  if ([30, 31, 32, 33, 34, 35].includes(weather.code) || (biome === "desert" && weather.gust >= 35)) hazard = "dust";
  else if (weather.temperature >= 34 || weather.apparent >= 38) hazard = "heat";
  else if (biome === "desert" && weather.soilMoisture < .1 && weather.humidity < 30) hazard = "dry";
  else if ((biome === "polar" || weatherKind === "snow") && weather.temperature <= 0) hazard = "ice";
  const aurora = time === "night" && Math.abs(lat) >= 54 && weather.cloud < 66 && auroraChance >= 12;
  return { time, weather: weatherKind, biome, hazard, aurora, auroraChance };
}

function weatherIcon(environment: Environment) {
  if (environment.weather === "storm") return "ϟ";
  if (environment.weather === "snow") return "❄";
  if (environment.weather === "rain") return "╱";
  if (environment.weather === "fog") return "≋";
  if (environment.hazard === "dust") return "◌";
  if (environment.aurora) return "⌁";
  if (environment.time === "night") return "☾";
  if (environment.time === "dawn" || environment.time === "dusk") return "◐";
  return "☼";
}

function environmentLabel(environment: Environment) {
  if (environment.weather === "storm") return "STORM";
  if (environment.weather === "snow") return "SNOW";
  if (environment.weather === "rain") return "RAIN";
  if (environment.weather === "fog") return "FOG";
  if (environment.hazard === "dust") return "SANDSTORM";
  if (environment.aurora) return "AURORA";
  if (environment.hazard === "heat") return "HEAT";
  if (environment.biome === "desert") return "DESERT";
  return environment.time.toUpperCase();
}

function seasonFor(lat: number, month = new Date().getUTCMonth()) {
  const north = ["WINTER", "SPRING", "SUMMER", "AUTUMN"];
  const index = month === 11 || month <= 1 ? 0 : month <= 4 ? 1 : month <= 7 ? 2 : 3;
  return north[lat >= 0 ? index : (index + 2) % 4];
}

function storyText(story: Story, locale: Locale, showOriginal: boolean) {
  if (showOriginal || story.lang === locale) return story.text;
  return story.translations[locale] ?? story.translations.en ?? story.text;
}

function replyText(reply: Reply, locale: Locale, showOriginal: boolean) {
  if (showOriginal || reply.lang === locale) return reply.text;
  return reply.translations[locale] ?? reply.translations.en ?? reply.text;
}

type WorldProps = {
  stories: Story[];
  activity: DailyActivitySnapshot;
  journeys: Journey[];
  activeJourneyId: string | null;
  textureUrl: string;
  baseTextureUrl: string;
  homePoint: { lat: number; lon: number } | null;
  selectedId: string | null;
  focus: FocusPoint;
  zoomCommand: ZoomCommand;
  onSelect: (story: Story) => void;
  onPick: (lat: number, lon: number) => void;
  onZoom: (zoom: number) => void;
  onNear: () => void;
};

type WorldApi = {
  focus: (lat: number, lon: number) => void;
  zoom: (delta: number) => void;
  setActivity: (snapshot: DailyActivitySnapshot) => void;
};

function LivingWorld({ stories, activity, journeys, activeJourneyId, textureUrl, baseTextureUrl, homePoint, selectedId, focus, zoomCommand, onSelect, onPick, onZoom, onNear }: WorldProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<WorldApi | null>(null);
  const activityRef = useRef(activity);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onPickRef = useRef(onPick);
  const onZoomRef = useRef(onZoom);
  const onNearRef = useRef(onNear);
  const zoomCommandRef = useRef(zoomCommand);
  const lastZoomNonceRef = useRef(0);

  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onPickRef.current = onPick; }, [onPick]);
  useEffect(() => { onZoomRef.current = onZoom; }, [onZoom]);
  useEffect(() => { onNearRef.current = onNear; }, [onNear]);
  useEffect(() => { apiRef.current?.focus(focus.lat, focus.lon); }, [focus]);
  useEffect(() => {
    activityRef.current = activity;
    apiRef.current?.setActivity(activity);
  }, [activity]);
  useEffect(() => {
    zoomCommandRef.current = zoomCommand;
    if (zoomCommand.nonce > lastZoomNonceRef.current && apiRef.current) {
      apiRef.current.zoom(zoomCommand.delta);
      lastZoomNonceRef.current = zoomCommand.nonce;
    }
  }, [zoomCommand]);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void import("three").then((THREE) => {
      if (cancelled) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 6.8);
    let renderer: import("three").WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
      host.classList.add("has-webgl");
    } catch {
      host.classList.add("no-webgl");
      let fallbackZoom = .2;
      apiRef.current = {
        focus: () => { /* The fallback keeps the user's current depth. */ },
        setActivity: () => { /* CSS fallback activity glows update through React. */ },
        zoom: (delta) => {
          fallbackZoom = THREE.MathUtils.clamp(fallbackZoom - delta / 6.28, 0, 1);
          onZoomRef.current(fallbackZoom);
          if (fallbackZoom >= .98 && delta < 0) onNearRef.current();
        },
      };
      const fallbackPointers = new Map<number, { x: number; y: number }>();
      let fallbackPinchDistance = 0;
      const fallbackWheel = (event: WheelEvent) => {
        event.preventDefault();
        apiRef.current?.zoom(event.deltaY * .0034);
      };
      const fallbackDown = (event: PointerEvent) => {
        fallbackPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (fallbackPointers.size === 2) {
          const [a, b] = [...fallbackPointers.values()];
          fallbackPinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
        }
        host.setPointerCapture(event.pointerId);
      };
      const fallbackMove = (event: PointerEvent) => {
        if (!fallbackPointers.has(event.pointerId)) return;
        fallbackPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (fallbackPointers.size < 2) return;
        const [a, b] = [...fallbackPointers.values()];
        const nextDistance = Math.hypot(a.x - b.x, a.y - b.y);
        if (fallbackPinchDistance > 0) apiRef.current?.zoom((fallbackPinchDistance - nextDistance) * .008);
        fallbackPinchDistance = nextDistance;
      };
      const fallbackUp = (event: PointerEvent) => {
        fallbackPointers.delete(event.pointerId);
        if (fallbackPointers.size < 2) fallbackPinchDistance = 0;
      };
      host.addEventListener("wheel", fallbackWheel, { passive: false });
      host.addEventListener("pointerdown", fallbackDown);
      host.addEventListener("pointermove", fallbackMove);
      host.addEventListener("pointerup", fallbackUp);
      host.addEventListener("pointercancel", fallbackUp);
      if (zoomCommandRef.current.nonce > lastZoomNonceRef.current) {
        apiRef.current.zoom(zoomCommandRef.current.delta);
        lastZoomNonceRef.current = zoomCommandRef.current.nonce;
      }
      cleanup = () => {
        host.removeEventListener("wheel", fallbackWheel);
        host.removeEventListener("pointerdown", fallbackDown);
        host.removeEventListener("pointermove", fallbackMove);
        host.removeEventListener("pointerup", fallbackUp);
        host.removeEventListener("pointercancel", fallbackUp);
        host.classList.remove("no-webgl");
        apiRef.current = null;
      };
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    host.appendChild(renderer.domElement);

    const world = new THREE.Group();
    world.rotation.set(-0.08, -0.3, 0.02);
    scene.add(world);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin("anonymous");
    const tuneTexture = (map: import("three").Texture) => {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = renderer.capabilities.getMaxAnisotropy();
      map.needsUpdate = true;
    };
    const earthTexture = textureLoader.load(textureUrl, tuneTexture);
    const baseTexture = textureLoader.load(baseTextureUrl, tuneTexture);
    const activityTextures = new Set<import("three").Texture>();
    const activityTextureSize = window.innerWidth <= 760 ? 256 : 512;
    let activityFromTexture = createActivityTexture(THREE, activityRef.current, activityTextureSize);
    let activityToTexture = activityFromTexture;
    activityTextures.add(activityFromTexture);
    let activityBlendStartedAt = 0;
    let activityTextureToDispose: import("three").Texture | null = null;
    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dailyMap: { value: earthTexture },
        baseMap: { value: baseTexture },
        activityMapFrom: { value: activityFromTexture },
        activityMapTo: { value: activityToTexture },
        activityMix: { value: 1 },
        sunDirection: { value: latLonVector(THREE, subsolarPoint().lat, subsolarPoint().lon, 1).normalize() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vViewNormal;
        varying vec3 vObjectNormal;
        void main() {
          vUv = uv;
          vViewNormal = normalize(normalMatrix * normal);
          vObjectNormal = normalize(normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dailyMap;
        uniform sampler2D baseMap;
        uniform sampler2D activityMapFrom;
        uniform sampler2D activityMapTo;
        uniform float activityMix;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vViewNormal;
        varying vec3 vObjectNormal;
        float lightness(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
        float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
        void main() {
          vec2 earthUv = vec2(fract(vUv.x + .25), vUv.y);
          vec3 daily = texture2D(dailyMap, earthUv).rgb;
          vec3 base = texture2D(baseMap, earthUv).rgb;
          float baseSignal = smoothstep(.012, .07, lightness(base));
          base = mix(vec3(.025, .11, .19), base, baseSignal);
          float polarIce = smoothstep(.9, .985, abs(vObjectNormal.y));
          base = mix(base, vec3(.62, .76, .81), polarIce * .72);
          float dailySignal = smoothstep(.035, .12, lightness(daily));
          vec3 dayColor = mix(base, daily, dailySignal);
          float solar = dot(normalize(vObjectNormal), normalize(sunDirection));
          float daylight = smoothstep(-.11, .17, solar);
          float twilight = smoothstep(-.18, -.03, solar) * (1.0 - smoothstep(-.03, .14, solar));
          float land = smoothstep(.035, .18, max(dayColor.r, dayColor.g) - dayColor.b * .72);
          float citySeed = hash21(floor(earthUv * vec2(720.0, 360.0)));
          float cityLights = smoothstep(.992, .9995, citySeed) * land * (1.0 - daylight);
          vec3 nightColor = dayColor * vec3(.075, .105, .19) + vec3(.012, .028, .075);
          vec3 color = mix(nightColor, dayColor, daylight);
          color += vec3(1.0, .58, .2) * cityLights * 1.5;
          color += vec3(.42, .22, .12) * twilight * .2;
          vec4 activeFrom = texture2D(activityMapFrom, earthUv);
          vec4 activeTo = texture2D(activityMapTo, earthUv);
          vec4 activityData = mix(activeFrom, activeTo, activityMix);
          float activity = activityData.r;
          vec3 activityColor = vec3(.49, .37, 1.0);
          activityColor = mix(activityColor, vec3(.28, .9, .76), activityData.b * .42);
          activityColor = mix(activityColor, vec3(1.0, .72, .32), activityData.g * .44);
          float nightGain = mix(1.06, .3, daylight) + twilight * .18;
          float freshness = .82 + activityData.a * .28;
          color += activityColor * activity * nightGain * freshness * (.55 + activity * .52);
          float limb = pow(1.0 - max(vViewNormal.z, 0.0), 2.6);
          color += vec3(.045, .075, .16) * limb;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(2.18, 96, 96),
      earthMaterial,
    );
    world.add(earth);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.23, 72, 72),
      new THREE.MeshBasicMaterial({ color: 0x779cff, transparent: true, opacity: 0.075, side: THREE.BackSide, blending: THREE.AdditiveBlending }),
    );
    world.add(atmosphere);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(2.28, 72, 72),
      new THREE.MeshBasicMaterial({ color: 0x7657dc, transparent: true, opacity: 0.045, side: THREE.BackSide, blending: THREE.AdditiveBlending }),
    );
    world.add(glow);

    scene.add(new THREE.AmbientLight(0x9ca8d6, .72));
    scene.add(new THREE.HemisphereLight(0xa9c2ff, 0x304267, 1.05));
    const sun = new THREE.DirectionalLight(0xfff2d2, 2.7);
    const firstSunPoint = subsolarPoint();
    sun.position.copy(latLonVector(THREE, firstSunPoint.lat, firstSunPoint.lon, 7));
    scene.add(sun);
    const syncSolarLight = () => {
      const solarPoint = subsolarPoint();
      const objectDirection = latLonVector(THREE, solarPoint.lat, solarPoint.lon, 1).normalize();
      earthMaterial.uniforms.sunDirection.value.copy(objectDirection);
      sun.position.copy(objectDirection.clone().applyQuaternion(world.quaternion).multiplyScalar(7));
    };
    syncSolarLight();
    const rim = new THREE.PointLight(0x7e66ff, 38, 18);
    rim.position.set(4, -1, -3);
    scene.add(rim);

    const starsGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(1200 * 3);
    for (let i = 0; i < 1200; i++) {
      const radius = 14 + Math.random() * 36;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    scene.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0xd8d0ff, size: 0.035, transparent: true, opacity: 0.7, sizeAttenuation: true })));

    const activityPointMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: .68,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const activityPoints = new THREE.InstancedMesh(new THREE.SphereGeometry(.028, 12, 12), activityPointMaterial, 128);
    activityPoints.count = 0;
    activityPoints.frustumCulled = false;
    world.add(activityPoints);
    const activityBridgeMaterial = new THREE.LineDashedMaterial({
      color: 0xa4f4db,
      transparent: true,
      opacity: .18,
      dashSize: .045,
      gapSize: .038,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const activityBridge = new THREE.Line(new THREE.BufferGeometry(), activityBridgeMaterial);
    activityBridge.visible = false;
    world.add(activityBridge);
    const activityDummy = new THREE.Object3D();
    let activityCellCount = 0;
    let activityRecentStrength = 0;

    const updateActivityVisuals = (snapshot: DailyActivitySnapshot) => {
      const visibleCells = snapshot.cells.filter((cell) => cell.intensity > 0).slice(0, 128);
      activityCellCount = visibleCells.length;
      activityRecentStrength = visibleCells.reduce((sum, cell) => sum + cell.recentCount, 0) / Math.max(1, visibleCells.length * 3);
      visibleCells.forEach((cell, index) => {
        activityDummy.position.copy(latLonVector(THREE, cell.centroidLat, cell.centroidLon, 2.247));
        const scale = .7 + cell.intensity * 2.05;
        activityDummy.scale.setScalar(scale);
        activityDummy.updateMatrix();
        activityPoints.setMatrixAt(index, activityDummy.matrix);
        const color = new THREE.Color(0x8b70ff);
        const total = Math.max(1, cell.textCount);
        color.lerp(new THREE.Color(0x63e7c8), Math.min(.42, cell.replyCount / total));
        color.lerp(new THREE.Color(0xffc46b), Math.min(.38, cell.wishCount / total));
        activityPoints.setColorAt(index, color);
      });
      activityPoints.count = activityCellCount;
      activityPoints.instanceMatrix.needsUpdate = true;
      if (activityPoints.instanceColor) activityPoints.instanceColor.needsUpdate = true;

      const dayCells = visibleCells.filter((cell) => ["day", "dawn"].includes(solarPhaseAt(cell.centroidLat, cell.centroidLon)));
      const nightCells = visibleCells.filter((cell) => ["night", "dusk"].includes(solarPhaseAt(cell.centroidLat, cell.centroidLon)));
      const from = dayCells[0];
      const to = nightCells[0];
      if (from && to && from.cellId !== to.cellId) {
        const start = latLonVector(THREE, from.centroidLat, from.centroidLon, 2.258);
        const end = latLonVector(THREE, to.centroidLat, to.centroidLon, 2.258);
        const angle = start.angleTo(end);
        const middle = start.clone().add(end);
        if (middle.lengthSq() < .001) middle.copy(start).cross(new THREE.Vector3(0, 1, 0));
        middle.normalize().multiplyScalar(2.7 + Math.min(.55, angle * .18));
        const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
        activityBridge.geometry.dispose();
        activityBridge.geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(72));
        activityBridge.computeLineDistances();
        activityBridge.visible = true;
      } else {
        activityBridge.visible = false;
      }
    };

    const setActivitySnapshot = (snapshot: DailyActivitySnapshot) => {
      const nextTexture = createActivityTexture(THREE, snapshot, activityTextureSize);
      activityTextures.add(nextTexture);
      if (activityTextureToDispose && activityTextureToDispose !== activityToTexture) {
        activityTextureToDispose.dispose();
        activityTextures.delete(activityTextureToDispose);
      }
      if (activityFromTexture !== activityToTexture && activityFromTexture !== activityTextureToDispose) {
        activityFromTexture.dispose();
        activityTextures.delete(activityFromTexture);
      }
      activityFromTexture = activityToTexture;
      activityToTexture = nextTexture;
      activityTextureToDispose = activityFromTexture;
      earthMaterial.uniforms.activityMapFrom.value = activityFromTexture;
      earthMaterial.uniforms.activityMapTo.value = activityToTexture;
      earthMaterial.uniforms.activityMix.value = 0;
      activityBlendStartedAt = performance.now();
      updateActivityVisuals(snapshot);
    };
    updateActivityVisuals(activityRef.current);

    const markerMeshes: import("three").Mesh[] = [];
    const haloMeshes: import("three").Mesh[] = [];
    const lifeMaterials: { expiresAt: number; baseOpacity: number; material: import("three").Material & { opacity: number } }[] = [];
    const chainGroups = Object.groupBy(stories, (story) => story.chain);
    const selectedChain = stories.find((story) => story.id === selectedRef.current)?.chain;

    Object.entries(chainGroups).forEach(([chain, chainStories]) => {
      const list = chainStories ?? [];
      if (list.length < 2) return;
      for (let i = 1; i < list.length; i++) {
        const start = latLonVector(THREE, list[i - 1].lat, list[i - 1].lon, 2.235);
        const end = latLonVector(THREE, list[i].lat, list[i].lon, 2.235);
        const edgeHash = stableHash(`${chain}-${list[i - 1].id}-${list[i].id}`);
        const lane = (stableHash(chain) % 9) - 4;
        const angle = start.angleTo(end);
        const axis = start.clone().cross(end);
        if (axis.lengthSq() < .0001) axis.crossVectors(start, new THREE.Vector3(0, 1, 0));
        if (axis.lengthSq() < .0001) axis.crossVectors(start, new THREE.Vector3(1, 0, 0));
        axis.normalize();
        const side = axis.multiplyScalar(lane * .035 + ((edgeHash % 5) - 2) * .012);
        const lift = 2.43 + Math.abs(lane) * .045 + Math.min(.36, angle * .18);
        const controlA = start.clone().lerp(end, .34).normalize().multiplyScalar(lift).add(side);
        const controlB = start.clone().lerp(end, .66).normalize().multiplyScalar(lift).add(side);
        const curve = new THREE.CubicBezierCurve3(start, controlA, controlB, end);
        const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(64));
        const material = new THREE.LineDashedMaterial({
          color: chainColor(chain), transparent: true,
          opacity: selectedChain === chain ? .68 : selectedChain ? .075 : .22,
          dashSize: .035 + (edgeHash % 3) * .012, gapSize: .022 + (edgeHash % 4) * .009,
          blending: THREE.AdditiveBlending,
        });
        const line = new THREE.Line(geometry, material);
        line.computeLineDistances();
        world.add(line);
        const deadlines = list.map((story) => story.expiresAt).filter((value): value is number => typeof value === "number");
        if (deadlines.length) lifeMaterials.push({ expiresAt: Math.max(...deadlines), baseOpacity: material.opacity, material });
      }
    });

    stories.forEach((story) => {
      const color = chainColor(story.chain);
      const markerMaterial = new THREE.MeshBasicMaterial({ color, transparent: true });
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(story.kind === "wish" ? 0.048 : 0.035, 18, 18),
        markerMaterial,
      );
      marker.position.copy(latLonVector(THREE, story.lat, story.lon, 2.235));
      marker.userData.storyId = story.id;
      marker.userData.expiresAt = story.expiresAt;
      world.add(marker);
      markerMeshes.push(marker);
      if (story.expiresAt) lifeMaterials.push({ expiresAt: story.expiresAt, baseOpacity: 1, material: markerMaterial });

      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.065, 0.082, 28),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
      );
      halo.position.copy(marker.position.clone().normalize().multiplyScalar(2.242));
      halo.lookAt(halo.position.clone().multiplyScalar(2));
      halo.userData.storyId = story.id;
      halo.userData.expiresAt = story.expiresAt;
      world.add(halo);
      haloMeshes.push(halo);

      story.replies.forEach((reply, replyIndex) => {
        const hash = stableHash(`${story.id}-${reply.id}`);
        const bearing = (hash % 360) * Math.PI / 180;
        const distance = .42 + (replyIndex % 3) * .17;
        const replyLat = reply.lat ?? Math.max(-88, Math.min(88, story.lat + Math.sin(bearing) * distance));
        const lonScale = Math.max(.3, Math.cos(story.lat * Math.PI / 180));
        const replyLon = reply.lon ?? story.lon + Math.cos(bearing) * distance / lonScale;
        const replyPoint = latLonVector(THREE, replyLat, replyLon, 2.244 + (replyIndex % 2) * .008);
        const microMaterial = new THREE.MeshBasicMaterial({ color, transparent: true });
        const micro = new THREE.Mesh(
          new THREE.SphereGeometry(.018 + Math.min(.012, reply.text.length / 12000), 12, 12),
          microMaterial,
        );
        micro.position.copy(replyPoint);
        world.add(micro);
        const bend = marker.position.clone().add(replyPoint).normalize().multiplyScalar(2.31 + replyIndex * .012);
        const threadCurve = new THREE.QuadraticBezierCurve3(marker.position, bend, replyPoint);
        const thread = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(threadCurve.getPoints(18)),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: selectedChain === story.chain ? .52 : .16, blending: THREE.AdditiveBlending }),
        );
        world.add(thread);
        if (story.expiresAt) {
          lifeMaterials.push({ expiresAt: story.expiresAt, baseOpacity: 1, material: microMaterial });
          lifeMaterials.push({ expiresAt: story.expiresAt, baseOpacity: (thread.material as import("three").LineBasicMaterial).opacity, material: thread.material as import("three").LineBasicMaterial });
        }
      });
    });

    if (homePoint) {
      const home = new THREE.Group();
      home.position.copy(latLonVector(THREE, homePoint.lat, homePoint.lon, 2.25));
      home.lookAt(home.position.clone().multiplyScalar(2));
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(.043, 20, 20),
        new THREE.MeshBasicMaterial({ color: 0x9fffe4 }),
      );
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(.075, .087, 32),
        new THREE.MeshBasicMaterial({ color: 0x7ff2db, transparent: true, opacity: .72, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
      );
      ring.position.z = .004;
      home.add(core, ring);
      home.userData.homeRing = ring;
      world.add(home);
      haloMeshes.push(ring);
    }

    const journeyVisuals: { journey: Journey; curve: import("three").QuadraticBezierCurve3; model: import("three").Group; trail: import("three").Line }[] = [];
    const assetMixers: import("three").AnimationMixer[] = [];
    journeys.forEach((journey) => {
      const spec = TRANSPORTS[journey.mode];
      const start = latLonVector(THREE, journey.from.lat, journey.from.lon, 2.255);
      const end = latLonVector(THREE, journey.to.lat, journey.to.lon, 2.255);
      const angle = start.angleTo(end);
      const altitude = journey.mode === "rocket" || journey.mode === "starship" ? 3.25 : journey.mode === "plane" ? 2.78 : 2.48;
      const middle = start.clone().add(end).normalize().multiplyScalar(altitude + angle * .22);
      const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
      const trailGeometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(96));
      const trailMaterial = new THREE.LineDashedMaterial({ color: spec.color, transparent: true, opacity: .62, dashSize: .055, gapSize: .035, blending: THREE.AdditiveBlending });
      const trail = new THREE.Line(trailGeometry, trailMaterial);
      trail.computeLineDistances();
      world.add(trail);
      const model = createCourierModel(THREE, journey.mode, spec.color);
      model.scale.setScalar(journey.id === activeJourneyId ? .42 : .31);
      world.add(model);
      journeyVisuals.push({ journey, curve, model, trail });
    });

    void import("three/examples/jsm/loaders/GLTFLoader.js").then(({ GLTFLoader }) => {
      if (cancelled) return;
      const loader = new GLTFLoader();
      const fitAsset = (root: import("three").Object3D) => {
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const maxSize = Math.max(size.x, size.y, size.z) || 1;
        const center = box.getCenter(new THREE.Vector3());
        root.position.sub(center);
        root.scale.setScalar(1 / maxSize);
      };
      journeyVisuals.forEach(({ journey, model }) => {
        const urls = COURIER_ASSETS[journey.mode];
        if (!urls) return;
        void Promise.all(urls.map((url) => loader.loadAsync(url))).then((assets) => {
          if (cancelled) return;
          const assembly = new THREE.Group();
          assets.forEach((asset, index) => {
            const root = asset.scene;
            fitAsset(root);
            if (journey.mode === "carriage") {
              root.position.x = index === 0 ? .28 : -.3;
              root.scale.multiplyScalar(index === 0 ? .8 : .7);
            }
            root.traverse((object) => {
              const mesh = object as import("three").Mesh;
              if (mesh.isMesh) {
                mesh.castShadow = false;
                mesh.receiveShadow = false;
              }
            });
            assembly.add(root);
            if (asset.animations.length) {
              const mixer = new THREE.AnimationMixer(root);
              mixer.clipAction(asset.animations[0]).play();
              assetMixers.push(mixer);
            }
          });
          model.clear();
          model.add(assembly);
        }).catch(() => { /* Procedural courier remains as the offline fallback. */ });
      });
    }).catch(() => { /* Procedural couriers remain available if the model loader cannot be fetched. */ });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown = false;
    let dragged = false;
    let lastX = 0;
    let lastY = 0;
    const activePointers = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    let cameraTarget = 6.8;
    let targetQuaternion: import("three").Quaternion | null = null;
    let nearTriggered = false;
    let zoomSnapTimer = 0;
    const cameraNear = 2.92;
    const cameraFar = 9.2;

    const updateCameraZoom = (delta: number) => {
      cameraTarget = THREE.MathUtils.clamp(cameraTarget + delta, cameraNear, cameraFar);
      const nextZoom = 1 - (cameraTarget - cameraNear) / (cameraFar - cameraNear);
      onZoomRef.current(nextZoom);
      if (delta < 0 && cameraTarget <= cameraNear + .09 && !nearTriggered) {
        nearTriggered = true;
        onNearRef.current();
      }
      if (cameraTarget > 3.4) nearTriggered = false;
    };

    const snapCameraZoom = () => {
      const currentZoom = 1 - (cameraTarget - cameraNear) / (cameraFar - cameraNear);
      const snappedZoom = nearestZoomStop(currentZoom);
      cameraTarget = cameraNear + (1 - snappedZoom) * (cameraFar - cameraNear);
      onZoomRef.current(snappedZoom);
    };

    const focusOn = (lat: number, lon: number) => {
      const local = latLonVector(THREE, lat, lon, 1).normalize();
      targetQuaternion = new THREE.Quaternion().setFromUnitVectors(local, new THREE.Vector3(0, 0, 1));
    };
    apiRef.current = { focus: focusOn, zoom: updateCameraZoom, setActivity: setActivitySnapshot };
    if (zoomCommandRef.current.nonce > lastZoomNonceRef.current) {
      updateCameraZoom(zoomCommandRef.current.delta);
      lastZoomNonceRef.current = zoomCommandRef.current.nonce;
    }

    const setPointer = (event: PointerEvent | WheelEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    const down = (event: PointerEvent) => {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      pointerDown = true;
      if (activePointers.size === 1) {
        dragged = false;
        lastX = event.clientX;
        lastY = event.clientY;
        targetQuaternion = null;
      } else if (activePointers.size === 2) {
        const [a, b] = [...activePointers.values()];
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
        dragged = true;
      }
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!activePointers.has(event.pointerId)) return;
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size >= 2) {
        const [a, b] = [...activePointers.values()];
        const nextDistance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDistance > 0) updateCameraZoom((pinchDistance - nextDistance) * .008);
        pinchDistance = nextDistance;
        dragged = true;
        return;
      }
      if (!pointerDown) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
      world.rotation.y += dx * 0.006;
      world.rotation.x += dy * 0.0055;
      lastX = event.clientX; lastY = event.clientY;
    };
    const cancelPointer = () => { activePointers.clear(); pointerDown = false; dragged = false; pinchDistance = 0; snapCameraZoom(); };
    const up = (event: PointerEvent) => {
      const wasSinglePointer = activePointers.size === 1;
      activePointers.delete(event.pointerId);
      pointerDown = activePointers.size > 0;
      if (activePointers.size === 1) {
        const remaining = [...activePointers.values()][0];
        lastX = remaining.x;
        lastY = remaining.y;
      }
      if (!wasSinglePointer) snapCameraZoom();
      if (!wasSinglePointer || dragged) return;
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const hitMarker = raycaster.intersectObjects(markerMeshes, false)[0];
      if (hitMarker) {
        const story = stories.find((item) => item.id === hitMarker.object.userData.storyId);
        if (story) onSelectRef.current(story);
        return;
      }
      const hitEarth = raycaster.intersectObject(earth, false)[0];
      if (hitEarth) {
        const inverse = world.quaternion.clone().invert();
        const local = hitEarth.point.clone().applyQuaternion(inverse);
        const point = vectorLatLon(local);
        onPickRef.current(point.lat, point.lon);
      }
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      updateCameraZoom(event.deltaY * 0.0034);
      window.clearTimeout(zoomSnapTimer);
      zoomSnapTimer = window.setTimeout(snapCameraZoom, 180);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", cancelPointer);
    renderer.domElement.addEventListener("lostpointercapture", cancelPointer);
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });

    const resize = () => {
      if (!host) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", resize);

    let frame = 0;
    let solarFrame = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), .05);
      const t = clock.elapsedTime;
      if (activityBlendStartedAt > 0) {
        const blend = Math.min(1, (performance.now() - activityBlendStartedAt) / 2200);
        earthMaterial.uniforms.activityMix.value = blend * blend * (3 - 2 * blend);
        if (blend >= 1) {
          activityBlendStartedAt = 0;
          if (activityTextureToDispose && activityTextureToDispose !== activityToTexture) {
            activityTextureToDispose.dispose();
            activityTextures.delete(activityTextureToDispose);
          }
          activityTextureToDispose = null;
          activityFromTexture = activityToTexture;
          earthMaterial.uniforms.activityMapFrom.value = activityToTexture;
          earthMaterial.uniforms.activityMapTo.value = activityToTexture;
        }
      }
      if (solarFrame++ % 240 === 0) syncSolarLight();
      assetMixers.forEach((mixer) => mixer.update(dt));
      if (!pointerDown && !targetQuaternion) world.rotation.y += 0.00028;
      if (targetQuaternion) {
        world.quaternion.slerp(targetQuaternion, 0.055);
        if (world.quaternion.angleTo(targetQuaternion) < 0.008) targetQuaternion = null;
      }
      sun.position.copy(earthMaterial.uniforms.sunDirection.value.clone().applyQuaternion(world.quaternion).multiplyScalar(7));
      camera.position.z += (cameraTarget - camera.position.z) * 0.06;
      glow.scale.setScalar(1 + Math.sin(t * 0.55) * 0.015);
      const activityLimit = camera.position.z > 7.3 ? 48 : camera.position.z > 5.95 ? 96 : 128;
      activityPoints.count = Math.min(activityCellCount, activityLimit);
      activityPointMaterial.opacity = .58 + Math.sin(t * (1.35 + Math.min(1, activityRecentStrength) * 1.8)) * (.055 + Math.min(1, activityRecentStrength) * .09);
      activityBridgeMaterial.opacity = .13 + Math.sin(t * .8) * .035;
      activityBridgeMaterial.dashOffset -= dt * .075;
      const frameNow = Date.now();
      lifeMaterials.forEach(({ expiresAt, baseOpacity, material }) => { material.opacity = baseOpacity * lifeAlpha(expiresAt, frameNow); });
      haloMeshes.forEach((halo, index) => {
        const active = halo.userData.storyId === selectedRef.current;
        const lifetime = lifeAlpha(halo.userData.expiresAt as number | undefined, frameNow);
        const pulse = 1 + Math.sin(t * 2.2 + index) * 0.16;
        halo.scale.setScalar(active ? pulse * 1.7 : pulse);
        (halo.material as import("three").MeshBasicMaterial).opacity = (active ? 0.95 : 0.32) * lifetime;
      });
      markerMeshes.forEach((marker) => marker.scale.setScalar(marker.userData.storyId === selectedRef.current ? 1.8 : 1));
      journeyVisuals.forEach(({ journey, curve, model, trail }, index) => {
        const duration = journey.demoDurationMs;
        const progress = Math.min(1, Math.max(.02, (Date.now() - journey.startedAt) / duration));
        const point = curve.getPoint(progress);
        const tangent = curve.getTangent(progress).normalize();
        model.position.copy(point);
        model.lookAt(point.clone().add(tangent));
        const flutter = journey.mode === "pigeon" ? Math.sin(t * 13) : 0;
        model.children.forEach((child) => {
          if (child.userData.wing) child.rotation.x = child.userData.wing * (1.05 + flutter * .52);
        });
        const active = journey.id === activeJourneyId;
        const nearScale = THREE.MathUtils.mapLinear(camera.position.z, cameraNear, cameraFar, active ? .25 : .18, active ? .44 : .31);
        model.scale.setScalar(nearScale * (1 + Math.sin(t * 2 + index) * .025));
        (trail.material as import("three").LineDashedMaterial).opacity = active ? .86 : .34;
      });
      renderer.render(scene, camera);
    };
    animate();

    cleanup = () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(zoomSnapTimer);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", cancelPointer);
      renderer.domElement.removeEventListener("lostpointercapture", cancelPointer);
      renderer.domElement.removeEventListener("wheel", wheel);
      earthTexture.dispose();
      baseTexture.dispose();
      activityTextures.forEach((texture) => texture.dispose());
      activityTextures.clear();
      earthMaterial.dispose();
      scene.traverse((object) => {
        const mesh = object as import("three").Mesh;
        mesh.geometry?.dispose?.();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else mesh.material?.dispose?.();
      });
      renderer.dispose();
      renderer.domElement.remove();
      host.classList.remove("has-webgl");
      apiRef.current = null;
    };
    }).catch(() => { if (!cancelled) host.classList.add("no-webgl"); });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [activeJourneyId, baseTextureUrl, homePoint, journeys, stories, textureUrl]);

  return <div className="world-canvas" ref={mountRef} aria-label="Draggable 3D Earth with KindChain stars">
    <div className="world-fallback">
      <div className="fallback-orbit orbit-a" /><div className="fallback-orbit orbit-b" />
      <div className="fallback-globe" style={{ backgroundImage: `url(${textureUrl}), url(${baseTextureUrl})` }} onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        onPick(90 - y * 180, x * 360 - 180);
      }}>
        <div className="fallback-night" />
        <div className="fallback-atmosphere" />
        {activity.cells.slice(0, 32).map((cell) => <span
          key={cell.cellId}
          className={`fallback-activity band-${cell.band}`}
          style={{ left: `${((cell.centroidLon + 180) / 360) * 100}%`, top: `${((90 - cell.centroidLat) / 180) * 100}%`, "--activity": String(cell.intensity) } as CSSProperties}
          aria-hidden="true"
        />)}
        <div className="fallback-chain-lines" />
        {stories.map((story, index) => <button key={story.id} className={`fallback-star chain-${index % 3} ${story.id === selectedId ? "active" : ""}`} style={{ left: `${Math.max(9, Math.min(91, ((story.lon + 180) / 360) * 82 + 9))}%`, top: `${Math.max(10, Math.min(90, ((90 - story.lat) / 180) * 80 + 10))}%` }} onClick={(event) => { event.stopPropagation(); onSelect(story); }} aria-label={`${story.region}: ${story.text}`}><i /></button>)}
        {journeys.map((journey) => {
          const startX = Math.max(8, Math.min(92, ((journey.from.lon + 180) / 360) * 84 + 8));
          const startY = Math.max(9, Math.min(91, ((90 - journey.from.lat) / 180) * 82 + 9));
          const endX = Math.max(8, Math.min(92, ((journey.to.lon + 180) / 360) * 84 + 8));
          const endY = Math.max(9, Math.min(91, ((90 - journey.to.lat) / 180) * 82 + 9));
          return <span key={journey.id} className={`fallback-courier courier-${journey.mode} ${journey.id === activeJourneyId ? "active" : ""}`} style={{ "--sx": `${startX}%`, "--sy": `${startY}%`, "--ex": `${endX}%`, "--ey": `${endY}%`, "--duration": `${Math.max(18, journey.demoDurationMs / 1000)}s` } as CSSProperties}><i>{TRANSPORTS[journey.mode].glyph}</i></span>;
        })}
      </div>
    </div>
  </div>;
}

function WeatherWall({ environment }: { environment: Environment }) {
  return (
    <div className={`weather-wall time-${environment.time} weather-${environment.weather} biome-${environment.biome} hazard-${environment.hazard} ${environment.aurora ? "aurora-active" : ""}`} aria-hidden="true">
      <div className="cosmic-nebula"><i /><i /><i /></div>
      <div className="sky-depth">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
      <div className="aurora-field"><i /><i /><i /></div>
      <div className="horizon-light"><i /></div>
      <div className="cloud-volume"><i /><i /><i /><i /></div>
      <div className="rain-field">{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ left: `${(i * 31) % 100}%`, animationDelay: `${-(i % 9) * 0.18}s`, animationDuration: `${0.7 + (i % 5) * 0.15}s` }} />)}</div>
      <div className="snow-field">{Array.from({ length: 34 }, (_, i) => <i key={i} style={{ left: `${(i * 43) % 100}%`, animationDelay: `${-(i % 11) * 0.7}s`, animationDuration: `${5 + (i % 6)}s` }}>·</i>)}</div>
      <div className="heat-field"><i /><i /><i /></div>
      <div className="dust-field">{Array.from({ length: 42 }, (_, i) => <i key={i} style={{ left: `${(i * 47) % 104 - 2}%`, top: `${(i * 29) % 86 + 5}%`, animationDelay: `${-(i % 13) * .43}s` }} />)}</div>
      <div className="fog-field"><i /><i /><i /></div>
      <div className="landscape-field"><i /><i /><i /><i /></div>
      <div className="lightning" />
    </div>
  );
}

function NeighborhoodMap({ point, label, locale, globeZoom, interactive, blend, zoomCommand, onZoomChange, onExitZoom, onPick }: {
  point: { lat: number; lon: number };
  label: string;
  locale: Locale;
  globeZoom: number;
  interactive: boolean;
  blend: number;
  zoomCommand: ZoomCommand;
  onZoomChange: (zoom: number) => void;
  onExitZoom: () => void;
  onPick: (lat: number, lon: number) => void;
}) {
  const viewLat = Math.round(point.lat * 100) / 100;
  const viewLon = Math.round(point.lon * 100) / 100;
  const initialMapZoom = interactive ? MAP_ENTRY_ZOOM : 10.35 + Math.max(0, Math.min(1, (globeZoom - .78) / .22)) * (MAP_ENTRY_ZOOM - 10.35);
  const hostRef = useRef<HTMLDivElement>(null);
  const initialMapZoomRef = useRef(initialMapZoom);
  const initialViewRef = useRef({ lat: viewLat, lon: viewLon });
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const pickRef = useRef(onPick);
  const zoomCommandRef = useRef(zoomCommand);
  const lastZoomNonceRef = useRef(0);
  const interactiveRef = useRef(interactive);
  const onZoomChangeRef = useRef(onZoomChange);
  const onExitZoomRef = useRef(onExitZoom);
  const [mapZoom, setMapZoom] = useState(initialMapZoom);
  const mapZoomRef = useRef(initialMapZoom);
  const [mapError, setMapError] = useState(false);
  useEffect(() => { pickRef.current = onPick; }, [onPick]);
  useEffect(() => { onZoomChangeRef.current = onZoomChange; }, [onZoomChange]);
  useEffect(() => { onExitZoomRef.current = onExitZoom; }, [onExitZoom]);
  useEffect(() => { interactiveRef.current = interactive; }, [interactive]);
  useEffect(() => {
    markerRef.current?.setLngLat([viewLon, viewLat]);
    mapRef.current?.easeTo({ center: [viewLon, viewLat], duration: 650 });
  }, [viewLat, viewLon]);
  useEffect(() => {
    zoomCommandRef.current = zoomCommand;
    const map = mapRef.current;
    if (zoomCommand.nonce <= lastZoomNonceRef.current) return;
    lastZoomNonceRef.current = zoomCommand.nonce;
    const target = (map?.getZoom() ?? mapZoomRef.current) - zoomCommand.delta * .92;
    if (zoomCommand.delta > 0 && target <= MAP_EXIT_ZOOM) {
      onExitZoomRef.current();
      return;
    }
    const nextZoom = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, target));
    if (map) map.easeTo({ zoom: nextZoom, duration: 420 });
    else {
      mapZoomRef.current = nextZoom;
      setMapZoom(nextZoom);
      onZoomChangeRef.current(nextZoom);
    }
  }, [zoomCommand]);
  useEffect(() => {
    const map = mapRef.current;
    if (interactive) return;
    const previewDepth = Math.max(0, Math.min(1, (globeZoom - .78) / .22));
    const nextZoom = 10.35 + previewDepth * (MAP_ENTRY_ZOOM - 10.35);
    if (map) map.easeTo({ zoom: nextZoom, duration: 180 });
    else {
      mapZoomRef.current = nextZoom;
      setMapZoom(nextZoom);
      onZoomChangeRef.current(nextZoom);
    }
  }, [globeZoom, interactive]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let leaving = false;
    let map: import("maplibre-gl").Map | undefined;
    void import("maplibre-gl").then((maplibre) => {
      if (cancelled) return;
      try {
        map = new maplibre.Map({
          container: host,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: [initialViewRef.current.lon, initialViewRef.current.lat],
          zoom: initialMapZoomRef.current,
          pitch: 34,
          bearing: -8,
          minZoom: MAP_MIN_ZOOM,
          maxZoom: MAP_MAX_ZOOM,
          attributionControl: true,
          antialias: true,
        });
        mapRef.current = map;
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();
        markerRef.current = new maplibre.Marker({ color: "#c8acff", scale: .66 }).setLngLat([initialViewRef.current.lon, initialViewRef.current.lat]).addTo(map);
        const updateZoom = () => {
          const nextZoom = map?.getZoom() ?? MAP_ENTRY_ZOOM;
          mapZoomRef.current = nextZoom;
          setMapZoom(nextZoom);
          onZoomChangeRef.current(nextZoom);
          if (interactiveRef.current && !leaving && nextZoom <= MAP_EXIT_ZOOM) {
            leaving = true;
            onExitZoomRef.current();
          }
        };
        map.on("zoom", updateZoom);
        map.on("click", (event) => pickRef.current(Math.round(event.lngLat.lat * 100) / 100, Math.round(event.lngLat.lng * 100) / 100));
        map.on("load", () => {
          if (!map) return;
          try {
            map.addSource("kindchain-terrain", {
              type: "raster-dem",
              tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
              tileSize: 256,
              maxzoom: 15,
              encoding: "terrarium",
            });
            map.setTerrain({ source: "kindchain-terrain", exaggeration: 1.32 });
          } catch { /* The base style remains usable if terrain is unavailable. */ }
          const privateDetail = /(building|house.?number|address|parcel|property|poi|shop|amenity)/i;
          for (const layer of map.getStyle().layers ?? []) {
            const sourceLayer = "source-layer" in layer ? String(layer["source-layer"] ?? "") : "";
            if (layer.type === "fill-extrusion" || privateDetail.test(`${layer.id} ${sourceLayer}`)) {
              map.setLayoutProperty(layer.id, "visibility", "none");
            }
          }
        });
        const pending = zoomCommandRef.current;
        if (pending.nonce > lastZoomNonceRef.current) {
          lastZoomNonceRef.current = pending.nonce;
          const target = map.getZoom() - pending.delta * .92;
          if (pending.delta > 0 && target <= MAP_EXIT_ZOOM) onExitZoomRef.current();
          else map.easeTo({ zoom: Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, target)), duration: 420 });
        }
      } catch {
        setMapError(true);
      }
    }).catch(() => { if (!cancelled) setMapError(true); });
    return () => {
      cancelled = true;
      mapRef.current = null;
      markerRef.current = null;
      map?.remove();
    };
  }, []);
  const lens = mapZoom >= 14 ? "NEIGHBORHOOD" : mapZoom >= 12.7 ? "DISTRICT" : mapZoom >= 11.5 ? "CITY" : "REGION";
  const zoomOutHint = locale === "zh" ? "缩小返回地球" : locale === "es" ? "Aleja para volver" : locale === "fr" ? "Dézoomez pour revenir" : locale === "ja" ? "縮小して地球へ" : "Zoom out to Earth";
  return (
    <section className={`neighborhood-map ${interactive ? "map-interactive" : ""}`} style={{ opacity: blend, transform: `scale(${.975 + blend * .025})` }} aria-label={`Progressive local view of ${label}`}>
      <div className="map-host" ref={hostRef} />
      <div className="map-atmosphere" />
      <header className="map-lens">
        <span className="map-scale-icon" aria-hidden="true">◎</span>
        <div><small>{lens} LENS · Z{mapZoom.toFixed(1)}</small><strong>{label}</strong></div>
        <em>{zoomOutHint}<br />MAX Z{MAP_MAX_ZOOM}</em>
      </header>
      <div className="map-coordinate">≈ {Math.abs(viewLat).toFixed(1)}°{viewLat >= 0 ? "N" : "S"} · {Math.abs(viewLon).toFixed(1)}°{viewLon >= 0 ? "E" : "W"} · {locale === "zh" ? "模糊区域" : "COARSE AREA"}</div>
      {mapError && <div className="map-error">地图流正在重新连接，地球视图仍可使用。</div>}
    </section>
  );
}

function LocationGate({ locale, onAllow, onLater }: { locale: Locale; onAllow: () => void; onLater: () => void }) {
  const zh = locale === "zh";
  return (
    <section className="location-gate" role="dialog" aria-modal="true" aria-label={zh ? "位置选择" : "Location choice"}>
      <div className="location-orb"><i /><i /><b>⌖</b></div>
      <small>YOUR SKY · PRIVATE BY DESIGN</small>
      <h2>{zh ? "让地球从你此刻的天空醒来？" : "Wake the Earth from your sky?"}</h2>
      <p>{zh ? "允许后，我们只用位置生成当地天气、晨昏与回家坐标；公开的光仍会模糊位置。" : "Your location shapes local weather, daylight and the home beacon. Public lights remain blurred."}</p>
      <div><button onClick={onLater}>{zh ? "先看看地球" : "Explore first"}</button><button onClick={onAllow}>⌖ {zh ? "使用我的位置" : "Use my location"}</button></div>
    </section>
  );
}

function KindnessOnboarding({ locale, stage, onReceive, onSkip }: { locale: Locale; stage: OnboardingStage; onReceive: () => void; onSkip: () => void }) {
  if (stage === "done" || stage === "boot") return null;
  const zh = locale === "zh";
  return (
    <section className={`kindness-onboarding stage-${stage}`} role="dialog" aria-modal="true" aria-label={zh ? "接住一束光" : "Receive a light"}>
      <div className="onboarding-sky" aria-hidden="true"><i /><i /><i /><b>✦</b></div>
      <small>{stage === "seeking" ? (zh ? "正在穿过晨昏线" : "CROSSING THE TERMINATOR") : (zh ? "一束尚未被回应的光" : "AN UNANSWERED LIGHT")}</small>
      <h1>{stage === "seeking" ? (zh ? "地球正在寻找一束光……" : "The Earth is finding a light…") : (zh ? "接住它，不需要先介绍自己。" : "Receive it. No introduction needed.")}</h1>
      <p>{zh ? "你可以只读，也可以回一句。这里不要求建议，不需要点赞，只让一个人知道：世界听见了。" : "Read it, or leave one gentle line. No advice or likes required—only proof that the world heard."}</p>
      <div className="onboarding-actions">
        <button type="button" onClick={onSkip}>{zh ? "先自由看看" : "Explore freely"}</button>
        <button type="button" disabled={stage !== "ready"} onClick={onReceive}><i>✦</i>{zh ? "接住一束光" : "Receive this light"}</button>
      </div>
      <em>{zh ? "不需要定位 · 可随时跳过 · 演示内容" : "No location needed · always skippable · experience content"}</em>
    </section>
  );
}

function ReplyArrivalCeremony({ locale, ceremony, onClose }: { locale: Locale; ceremony: ReplyCeremony; onClose: () => void }) {
  const zh = locale === "zh";
  return (
    <section className="reply-ceremony" role="status" aria-live="polite">
      <div className="ceremony-orbit" aria-hidden="true"><i /><i /><b>✦</b><em>✦</em></div>
      <small>{zh ? "你的回应正在成为星链的一部分" : "YOUR REPLY IS JOINING THE CONSTELLATION"}</small>
      <h2>{zh ? "这一刻，世界多了一处被看见的地方。" : "For this moment, one place in the world feels seen."}</h2>
      <p>“{ceremony.message}”</p>
      <div><span>{ceremony.region}</span><i>·</i><span>{ceremony.weather}</span><i>·</i><span>{ceremony.localTime}</span></div>
      <button type="button" onClick={onClose}>{zh ? "回到地球" : "Return to Earth"} →</button>
    </section>
  );
}

function CourierHero3D({ mode, variant = 0 }: { mode: CourierMode; variant?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    const urls = COURIER_ASSETS[mode];
    if (!host || !urls) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void Promise.all([import("three"), import("three/examples/jsm/loaders/GLTFLoader.js")]).then(async ([THREE, { GLTFLoader }]) => {
      if (cancelled) return;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(36, host.clientWidth / host.clientHeight, .1, 30);
      const frameCamera = () => {
        const portrait = host.clientWidth < 540 || host.clientHeight > host.clientWidth * 1.18;
        camera.fov = portrait ? 41 : 34;
        camera.position.set(0, mode === "carriage" || mode === "rail" ? .02 : .16, portrait ? 4.15 : 3.18);
        camera.updateProjectionMatrix();
      };
      frameCamera();
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, host.clientWidth < 620 ? 1.4 : 2));
      renderer.setSize(host.clientWidth, host.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      host.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xcbd7f4, 0x222233, .86));
      const key = new THREE.DirectionalLight(0xffddb1, 2.8);
      key.position.set(2, 4, 5);
      scene.add(key);
      const rim = new THREE.PointLight(0x91a9ff, 8.5, 12);
      rim.position.set(-3, 1, -2);
      scene.add(rim);
      const loader = new GLTFLoader();
      const mixers: import("three").AnimationMixer[] = [];
      try {
        const assets = await Promise.all(urls.map((url) => loader.loadAsync(url)));
        if (cancelled) { renderer.dispose(); renderer.domElement.remove(); return; }
        const assembly = new THREE.Group();
        assets.forEach((asset, index) => {
          const root = asset.scene;
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const maxSize = Math.max(size.x, size.y, size.z) || 1;
          const center = box.getCenter(new THREE.Vector3());
          root.position.sub(center);
          root.scale.setScalar(1 / maxSize);
          if (mode === "carriage") {
            root.position.x = index === 0 ? .48 : -.36;
            root.scale.multiplyScalar(index === 0 ? .92 : .82);
          }
          if (mode === "pigeon" && variant > 0) {
            root.traverse((object) => {
              const mesh = object as import("three").Mesh;
              if (!mesh.isMesh || !mesh.material) return;
              const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              const recolored = materials.map((material) => {
                const next = material.clone() as import("three").MeshStandardMaterial;
                if ("color" in next && next.color) {
                  const palette = [0xe9edf1, 0x8fa6c9, 0xc7b1e8, 0xe0c176];
                  next.color.lerp(new THREE.Color(palette[Math.min(3, variant)]), .46);
                }
                return next;
              });
              mesh.material = Array.isArray(mesh.material) ? recolored : recolored[0];
            });
          }
          assembly.add(root);
          if (asset.animations.length) {
            const mixer = new THREE.AnimationMixer(root);
            const preferred = asset.animations.find((clip) => /fly|flight|gallop|run|walk/i.test(clip.name)) ?? asset.animations[0];
            const action = mixer.clipAction(preferred);
            action.timeScale = mode === "pigeon" ? 1.15 : mode === "carriage" ? .9 : 1;
            action.play();
            mixers.push(mixer);
          }
        });
        const display = new THREE.Group();
        display.add(assembly);
        const assembledBox = new THREE.Box3().setFromObject(assembly);
        const assembledSize = assembledBox.getSize(new THREE.Vector3());
        const assembledCenter = assembledBox.getCenter(new THREE.Vector3());
        assembly.position.sub(assembledCenter);
        display.scale.setScalar(1.65 / (Math.max(assembledSize.x, assembledSize.y, assembledSize.z) || 1));
        display.rotation.y = mode === "rocket" || mode === "starship" ? -.82 : -.48;
        display.rotation.x = mode === "carriage" || mode === "rail" ? -.04 : .03;
        scene.add(display);
        if (mode === "carriage") {
          const lantern = new THREE.PointLight(0xffa852, 2.6, 4.2);
          lantern.position.set(.48, -.16, .6);
          display.add(lantern);
        }
        host.classList.add("has-model");
        const clock = new THREE.Clock();
        let frame = 0;
        const render = () => {
          frame = requestAnimationFrame(render);
          const dt = Math.min(clock.getDelta(), .05);
          mixers.forEach((mixer) => mixer.update(dt));
          const pulse = Math.sin(clock.elapsedTime * (mode === "pigeon" ? 2.4 : 4.2));
          display.position.y = pulse * (mode === "carriage" || mode === "rail" ? .014 : .045);
          display.rotation.z = pulse * (mode === "pigeon" ? .018 : .006);
          display.rotation.y = (mode === "rocket" || mode === "starship" ? -.82 : -.48) + Math.sin(clock.elapsedTime * .42) * (mode === "pigeon" ? .045 : .008);
          renderer.render(scene, camera);
        };
        render();
        const resize = () => {
          camera.aspect = host.clientWidth / host.clientHeight;
          frameCamera();
          renderer.setSize(host.clientWidth, host.clientHeight);
        };
        window.addEventListener("resize", resize);
        cleanup = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener("resize", resize);
          scene.traverse((object) => {
            const mesh = object as import("three").Mesh;
            mesh.geometry?.dispose?.();
            if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
            else mesh.material?.dispose?.();
          });
          renderer.dispose();
          renderer.domElement.remove();
          host.classList.remove("has-model");
        };
      } catch {
        renderer.dispose();
        renderer.domElement.remove();
      }
    }).catch(() => { host.classList.remove("has-model"); });
    return () => { cancelled = true; cleanup?.(); };
  }, [mode, variant]);
  return <div className={`courier-hero courier-hero-${mode}`} ref={hostRef} aria-hidden="true" />;
}

function JourneyStage({ journey, locale, earthHidden, onToggleEarth, onExit }: {
  journey: Journey; locale: Locale; earthHidden: boolean; onToggleEarth: () => void; onExit: () => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const spec = TRANSPORTS[journey.mode];
  const progress = journeyProgress(journey);
  const c = UI[locale];
  const scene = routeScene(journey, progress);
  const shot = progress < .12 ? "departure" : progress < .72 ? "cruise" : progress < .94 ? "approach" : "arrival";
  const daylightArc = Math.max(0, Math.min(1, (scene.localHour - 5.5) / 14.5));
  const sceneStyle = {
    "--route-progress": progress,
    "--sun-x": `${8 + daylightArc * 84}%`,
    "--sun-y": `${46 - Math.sin(daylightArc * Math.PI) * 34}%`,
  } as CSSProperties;
  const localClock = `${String(Math.floor(scene.localHour)).padStart(2, "0")}:${String(Math.floor((scene.localHour % 1) * 60)).padStart(2, "0")}`;
  return (
    <section className={`journey-stage stage-${journey.mode} shot-${shot} scene-${scene.time} biome-${scene.biome} route-zone-${scene.zone} weather-${scene.weather} hazard-${scene.hazard}`} style={sceneStyle} aria-label={`${spec.names[locale]} journey`}>
      <div className="cinema-sky"><i className="sun" /><i className="moon" /><i className="atmosphere-band" /></div>
      <div className="cinema-stars">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ left: `${(index * 37) % 96}%`, top: `${6 + (index * 23) % 56}%`, animationDelay: `${-(index % 7) * .7}s` }} />)}</div>
      <div className="cinema-clouds"><i /><i /><i /><i /></div>
      <div className="cinema-mountains"><i /><i /><i /></div>
      <div className="cinema-region"><i /><i /><i /><i /><i /></div>
      <div className="cinema-ground"><i /><i /><i /></div>
      <div className="cinema-track"><i /><i /></div>
      <div className="cinema-weather-pass"><i /><i /><i /></div>
      <CourierHero3D mode={journey.mode} variant={journey.courierVariant} />
      <div className={`cinema-courier vehicle-${journey.mode}`} aria-hidden="true">
        <i className="vehicle-glow" /><i className="vehicle-body" /><i className="vehicle-wing wing-a" /><i className="vehicle-wing wing-b" />
        <i className="vehicle-wheel wheel-a" /><i className="vehicle-wheel wheel-b" /><i className="vehicle-light" />
      </div>
      {journey.mode === "pigeon" && (journey.flockSize ?? 1) > 1 && <div className={`cinema-flock flock-${Math.min(3, journey.flockSize ?? 1)}`}><i>◇</i><i>◇</i></div>}
      <div className="cinema-light-sweep" />
      {progress >= 1 && <div className="journey-arrived"><i>✦</i><small>{locale === "zh" ? "旅程抵达 · 新的连线已点亮" : "JOURNEY ARRIVED · A NEW LINK IS LIT"}</small></div>}
      <div className="cinema-vignette" /><div className="cinema-grain" />
      <header className="journey-hud">
        <button className="journey-back" onClick={onExit}>← <span>EARTH</span></button>
        <div><small>{c.inFlight.toUpperCase()} · {scene.zone.replaceAll("-", " ")} · {localClock}</small><strong>{spec.names[locale]}</strong><em>{Math.abs(scene.lat).toFixed(1)}°{scene.lat >= 0 ? "N" : "S"} · {Math.abs(scene.lon).toFixed(1)}°{scene.lon >= 0 ? "E" : "W"}</em></div>
        <button className="earth-toggle" onClick={onToggleEarth}>{earthHidden ? c.earthOn : c.earthOff}</button>
      </header>
      <footer className="journey-telemetry">
        <div className="route-names"><span><i />{journey.from.label}</span><b>{Math.round(progress * 100)}%</b><span>{journey.to.label}<i /></span></div>
        <div className="journey-progress"><i style={{ width: `${progress * 100}%` }}><b /></i></div>
        <div className="journey-numbers">
          <span><small>{c.distance.toUpperCase()}</small><b>{Math.round(journey.distance).toLocaleString()} km</b></span>
          <span><small>{c.arrival.toUpperCase()}</small><b>{formatDuration(journey.etaHours, locale)}</b></span>
          <span><small>ROUTE MODEL</small><b>{Math.round(journey.routeDistance).toLocaleString()} km</b></span>
        </div>
      </footer>
    </section>
  );
}

function useSoundscape(on: boolean, environment: Environment) {
  useEffect(() => {
    if (!on) return;
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = 0.035;
    master.connect(ctx.destination);
    const oscillators: OscillatorNode[] = [];
    [110, 164.8, 220].forEach((frequency, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = index === 1 ? "sine" : "triangle";
      osc.frequency.value = frequency * (environment.time === "night" ? 0.75 : environment.time === "dawn" ? .9 : 1);
      gain.gain.value = index === 0 ? 0.18 : 0.045;
      osc.connect(gain).connect(master);
      osc.start();
      oscillators.push(osc);
    });
    if (["rain", "storm", "snow"].includes(environment.weather) || environment.hazard === "dust") {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = environment.weather === "snow" ? "lowpass" : "bandpass";
      filter.frequency.value = environment.weather === "snow" ? 350 : environment.hazard === "dust" ? 520 : 1250;
      const rainGain = ctx.createGain();
      rainGain.gain.value = environment.weather === "storm" ? 0.7 : environment.weather === "snow" ? 0.12 : environment.hazard === "dust" ? .27 : 0.42;
      source.connect(filter).connect(rainGain).connect(master);
      source.start();
    }
    return () => { oscillators.forEach((osc) => osc.stop()); void ctx.close(); };
  }, [environment, on]);
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("zh");
  const [panel, setPanel] = useState<Panel>(null);
  const [stories, setStories] = useState<Story[]>(INITIAL_STORIES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [weather, setWeather] = useState<Weather>({ temperature: 21, apparent: 20, wind: 12, gust: 18, cloud: 18, precipitation: 0, humidity: 52, visibility: 24000, soilMoisture: .22, code: 1, isDay: true, localHour: 15, timezone: "America/Edmonton" });
  const [location, setLocation] = useState({ lat: 53.55, lon: -113.49, label: "Edmonton · sample" });
  const [focus, setFocus] = useState<FocusPoint>({ lat: 25, lon: -20, nonce: 0 });
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [locationGate, setLocationGate] = useState(false);
  const [locationIntent, setLocationIntent] = useState<LocationIntent>(null);
  const [nearView, setNearView] = useState(false);
  const [zoomCommand, setZoomCommand] = useState<ZoomCommand>({ delta: 0, nonce: 0 });
  const [mapZoomCommand, setMapZoomCommand] = useState<ZoomCommand>({ delta: 0, nonce: 0 });
  const [mapZoom, setMapZoom] = useState(MAP_ENTRY_ZOOM);
  const [auroraChance, setAuroraChance] = useState(0);
  const [sound, setSound] = useState(false);
  const [zoom, setZoom] = useState(0.2);
  const [notice, setNotice] = useState<string | null>(null);
  const [composeMode, setComposeMode] = useState<ComposeMode>("light");
  const [composeScene, setComposeScene] = useState<ComposeScene>(null);
  const [composeStep, setComposeStep] = useState<1 | 2 | 3>(1);
  const [draftText, setDraftText] = useState("");
  const [delivery, setDelivery] = useState<Delivery>("random");
  const [courierMode, setCourierMode] = useState<CourierMode>("pigeon");
  const [pickedPlace, setPickedPlace] = useState<{ lat: number; lon: number } | null>(null);
  const [journeys, setJourneys] = useState<Journey[]>(() => [{
    id: "journey-demo-pigeon", storyId: "kr-1", mode: "pigeon",
    from: { lat: 53.55, lon: -113.49, label: "Edmonton" }, to: { lat: 37.57, lon: 126.98, label: "Seoul" },
    ...estimateRoute("pigeon", { lat: 53.55, lon: -113.49 }, { lat: 37.57, lon: 126.98 }),
    startedAt: Date.now() - 19000, demoDurationMs: 118000,
  }]);
  const [activeJourneyId, setActiveJourneyId] = useState<string | null>("journey-demo-pigeon");
  const [journeyView, setJourneyView] = useState(false);
  const [earthHidden, setEarthHidden] = useState(false);
  const [localeMenu, setLocaleMenu] = useState(false);
  const [now, setNow] = useState(0);
  const [onboardingStage, setOnboardingStage] = useState<OnboardingStage>("boot");
  const [replyCeremony, setReplyCeremony] = useState<ReplyCeremony | null>(null);
  const [messengerMemory, setMessengerMemory] = useState<MessengerMemory>({ ...EMPTY_MESSENGER_MEMORY });
  const [localStateReady, setLocalStateReady] = useState(false);
  const eventCounterRef = useRef(0);
  const actorDayKeyRef = useRef("local-session");
  const c = UI[locale];
  const extra = EXTRA_UI[locale];
  const pulse = PULSE_UI[locale];
  const selected = stories.find((story) => story.id === selectedId) ?? null;
  const activeJourney = journeys.find((journey) => journey.id === activeJourneyId) ?? journeys[0] ?? null;
  const solarMinute = Math.floor(now / 60000);
  const environment = useMemo(() => ({
    ...resolveEnvironment(weather, location.lat, location.lon, auroraChance),
    time: solarPhaseAt(location.lat, location.lon, new Date(solarMinute * 60000)),
  }), [auroraChance, location.lat, location.lon, solarMinute, weather]);
  const senderOrigin = useMemo(() => userLocation
    ? { lat: userLocation.lat, lon: userLocation.lon, label: locale === "zh" ? "我的天空" : "My sky" }
    : { lat: 53.55, lon: -113.49, label: locale === "zh" ? "私密天空" : "Private sky" }, [locale, userLocation]);
  const pigeonProfile = useMemo(() => messengerProfileFor(messengerMemory, locale), [locale, messengerMemory]);
  const activePigeonFlights = journeys.filter((journey) => journey.id !== "journey-demo-pigeon" && journey.mode === "pigeon" && journeyProgress(journey) < 1).length;

  useSoundscape(sound, environment);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      setNow(Date.now());
      try {
        const savedMemory = JSON.parse(window.localStorage.getItem("kindchain-messenger-memory-v1") ?? "null");
        setMessengerMemory(sanitizeMessengerMemory(savedMemory));
      } catch { setMessengerMemory({ ...EMPTY_MESSENGER_MEMORY }); }
      try {
        const savedState = JSON.parse(window.localStorage.getItem("kindchain-local-state-v1") ?? "null") as StoredLocalState | null;
        if (savedState?.version === 1 && Array.isArray(savedState.stories) && Array.isArray(savedState.journeys)) {
          const current = Date.now();
          setStories(savedState.stories.filter((story) => !story.expiresAt || story.expiresAt > current));
          setJourneys(savedState.journeys.slice(0, 30));
          setActiveJourneyId(savedState.journeys[0]?.id ?? null);
        }
      } catch { /* Corrupt local experience data falls back to the curated sky. */ }
      setLocalStateReady(true);
      const dayStamp = new Date().toISOString().slice(0, 10);
      const savedActor = window.localStorage.getItem("kindchain-activity-day-key");
      if (savedActor?.startsWith(`${dayStamp}:`)) actorDayKeyRef.current = savedActor;
      else {
        const nextActor = `${dayStamp}:${createLocalId()}`;
        actorDayKeyRef.current = nextActor;
        window.localStorage.setItem("kindchain-activity-day-key", nextActor);
      }
      if (window.localStorage.getItem("kindchain-onboarded") === "1") {
        setOnboardingStage("done");
      } else {
        window.setTimeout(() => {
          const firstLight = INITIAL_STORIES.find((story) => story.id === ONBOARDING_STORY_ID) ?? INITIAL_STORIES.find((story) => story.replies.length === 0) ?? INITIAL_STORIES[0];
          setOnboardingStage("seeking");
          setFocus((current) => ({ lat: firstLight.lat, lon: firstLight.lon, nonce: current.nonce + 1 }));
          window.setTimeout(() => setOnboardingStage("ready"), 1100);
        }, 1500);
      }
    }, 0);
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      setStories((items) => {
        const living = items.filter((story) => !story.expiresAt || story.expiresAt > current);
        return living.length === items.length ? items : living;
      });
    }, 1000);
    return () => { window.clearTimeout(boot); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (onboardingStage === "boot") return;
    window.localStorage.setItem("kindchain-messenger-memory-v1", JSON.stringify(messengerMemory));
  }, [messengerMemory, onboardingStage]);

  useEffect(() => {
    if (!localStateReady) return;
    const state: StoredLocalState = { version: 1, savedAt: Date.now(), stories, journeys: journeys.slice(0, 30) };
    window.localStorage.setItem("kindchain-local-state-v1", JSON.stringify(state));
  }, [journeys, localStateReady, stories]);

  const nasaDate = useMemo(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
  }, []);
  const textureUrl = useMemo(() => `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor&STYLES=&FORMAT=image/jpeg&TRANSPARENT=FALSE&HEIGHT=1024&WIDTH=2048&CRS=EPSG:4326&BBOX=-90,-180,90,180&TIME=${nasaDate}`, [nasaDate]);
  const baseTextureUrl = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=BlueMarble_ShadedRelief_Bathymetry&STYLES=&FORMAT=image/jpeg&TRANSPARENT=FALSE&HEIGHT=1024&WIDTH=2048&CRS=EPSG:4326&BBOX=-90,-180,90,180";

  const fetchWeather = useCallback(async (lat: number, lon: number, label?: string) => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,rain,showers,snowfall,snow_depth,weather_code,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m,soil_moisture_0_to_1cm&timezone=auto`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("weather unavailable");
      const data = await response.json() as { timezone: string; current: Record<string, number | string> };
      const localHour = Number(String(data.current.time ?? "12:00").slice(11, 13));
      const next: Weather = {
        temperature: Number(data.current.temperature_2m ?? 18),
        apparent: Number(data.current.apparent_temperature ?? 18),
        wind: Number(data.current.wind_speed_10m ?? 0),
        gust: Number(data.current.wind_gusts_10m ?? data.current.wind_speed_10m ?? 0),
        cloud: Number(data.current.cloud_cover ?? 0),
        precipitation: Number(data.current.precipitation ?? 0),
        humidity: Number(data.current.relative_humidity_2m ?? 50),
        visibility: Number(data.current.visibility ?? 20000),
        soilMoisture: Number(data.current.soil_moisture_0_to_1cm ?? .2),
        code: Number(data.current.weather_code ?? 0),
        isDay: data.current.is_day === 1,
        localHour: Number.isFinite(localHour) ? localHour : 12,
        timezone: data.timezone,
      };
      setWeather(next);
      setLocation({ lat, lon, label: label ?? `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} · ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}` });
    } catch {
      setLocation({ lat, lon, label: label ?? `${lat.toFixed(1)}°, ${lon.toFixed(1)}°` });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchWeather(53.55, -113.49, "Edmonton · sample"); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchWeather]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("https://services.swpc.noaa.gov/json/ovation_aurora_latest.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("aurora unavailable")))
      .then((data: { coordinates?: [number, number, number][] }) => {
        const nearby = (data.coordinates ?? []).filter(([lon, lat]) => Math.abs(lat - location.lat) <= 4 && Math.abs(lon - location.lon) <= 7);
        setAuroraChance(nearby.reduce((value, point) => Math.max(value, Number(point[2]) || 0), 0));
      })
      .catch(() => { if (!controller.signal.aborted) setAuroraChance(0); });
    return () => controller.abort();
  }, [location.lat, location.lon]);

  const localTime = useMemo(() => {
    try { return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, { hour: "2-digit", minute: "2-digit", timeZone: weather.timezone }).format(new Date()); }
    catch { return "--:--"; }
  }, [locale, weather.timezone]);

  const nearbyStories = useMemo(() => [...stories].sort((a, b) => distanceKm(location, a) - distanceKm(location, b)).slice(0, 5), [stories, location]);
  const chains = useMemo(() => Object.entries(Object.groupBy(stories, (story) => story.chain)).map(([name, items]) => {
    const list = items ?? [];
    const countries = new Set(list.flatMap((item) => [item.country, ...item.replies.map((reply) => reply.country).filter(Boolean) as string[]])).size;
    const starCount = list.reduce((count, item) => count + 1 + item.replies.length, 0);
    const rarity = starCount >= 8 && countries >= 3 ? 2 : starCount >= 3 ? 1 : 0;
    const deadlines = list.map((item) => item.expiresAt).filter((value): value is number => typeof value === "number");
    const expiresAt = deadlines.length ? Math.max(...deadlines) : null;
    return { name, list, countries, rarity, starCount, expiresAt };
  }), [stories]);
  const activityClock = Math.floor(now / 60000) * 60000;
  const dailyActivity = useMemo(() => buildDailyActivity(stories, activityClock), [activityClock, stories]);
  const activityTotals = useMemo(() => dailyActivity.cells.reduce((totals, cell) => ({
    textCount: totals.textCount + cell.textCount,
    recentCount: totals.recentCount + cell.recentCount,
    regions: totals.regions + 1,
  }), { textCount: 0, recentCount: 0, regions: 0 }), [dailyActivity]);
  const currentActivity = useMemo(() => {
    const nearest = dailyActivity.cells.map((cell) => ({ cell, distance: distanceKm(location, { lat: cell.centroidLat, lon: cell.centroidLon }) }))
      .sort((a, b) => a.distance - b.distance)[0];
    return nearest && nearest.distance <= 650 ? nearest.cell : null;
  }, [dailyActivity, location]);
  const terminatorPulse = useMemo(() => dailyActivity.cells.reduce((scores, cell) => {
    const phase = solarPhaseAt(cell.centroidLat, cell.centroidLon, new Date(activityClock));
    if (phase === "day" || phase === "dawn") scores.day += cell.textCount;
    else scores.night += cell.textCount;
    return scores;
  }, { day: 0, night: 0 }), [activityClock, dailyActivity]);
  const watchChain = useMemo(() => [...chains].sort((a, b) => {
    if (a.expiresAt && b.expiresAt) return a.expiresAt - b.expiresAt;
    if (a.expiresAt) return -1;
    if (b.expiresAt) return 1;
    return b.starCount - a.starCount;
  })[0] ?? null, [chains]);
  const choirGoal = currentActivity && currentActivity.uniquePublishers >= 10 ? 7 : currentActivity && currentActivity.uniquePublishers >= 4 ? 5 : 3;
  const choirProgress = Math.min(choirGoal, currentActivity?.textCount ?? 0);
  const shelterProgress = Math.min(3, stories.reduce((count, story) => count + (story.scene === "weather-shelter" ? 1 : 0) + story.replies.filter((reply) => reply.scene === "weather-shelter").length, 0));

  const composeTarget = useMemo(() => {
    if (composeMode === "reply" && selected) return { lat: selected.lat, lon: selected.lon, label: selected.region };
    if (delivery === "place" && pickedPlace) return { ...pickedPlace, label: c.selected };
    if (delivery === "nearby") return { lat: senderOrigin.lat + .18, lon: senderOrigin.lon - .12, label: c.near };
    return { lat: -1.29, lon: 36.82, label: locale === "zh" ? "地球某处" : "Somewhere on Earth" };
  }, [c.near, c.selected, composeMode, delivery, locale, pickedPlace, selected, senderOrigin]);
  const composeEstimate = useMemo(() => estimateRoute(courierMode, senderOrigin, composeTarget), [composeTarget, courierMode, senderOrigin]);

  const selectStory = useCallback((story: Story) => {
    setSelectedId(story.id);
    setShowOriginal(false);
    setNearView(false);
    setPanel("story");
    setFocus((current) => ({ lat: story.lat, lon: story.lon, nonce: current.nonce + 1 }));
    void fetchWeather(story.lat, story.lon, story.region);
  }, [fetchWeather]);

  const finishOnboarding = useCallback((receive: boolean) => {
    window.localStorage.setItem("kindchain-onboarded", "1");
    setOnboardingStage("done");
    if (!receive) return;
    const firstLight = stories.find((story) => story.id === ONBOARDING_STORY_ID) ?? stories.find((story) => story.replies.length === 0) ?? stories[0];
    if (firstLight) selectStory(firstLight);
  }, [selectStory, stories]);

  const pickEarth = useCallback((lat: number, lon: number) => {
    setPickedPlace({ lat, lon });
    if (panel === "compose" && delivery === "place") {
      setNotice(`${c.selected}: ${lat.toFixed(1)}°, ${lon.toFixed(1)}°`);
    } else {
      setFocus((current) => ({ lat, lon, nonce: current.nonce + 1 }));
      setPanel(null);
      void fetchWeather(lat, lon);
    }
  }, [c.selected, delivery, fetchWeather, panel]);

  const locateUser = useCallback(() => {
    setNotice(c.locating);
    if (!navigator.geolocation) { setNotice(c.denied); return; }
    if (userLocation) {
      setNearView(false);
      setFocus((current) => ({ ...userLocation, nonce: current.nonce + 1 }));
      void fetchWeather(userLocation.lat, userLocation.lon, locale === "zh" ? "我的天空" : "My sky");
      setPanel(null);
      setNotice(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setUserLocation({ lat, lon });
        setNearView(false);
        setFocus((current) => ({ lat, lon, nonce: current.nonce + 1 }));
        void fetchWeather(lat, lon, locale === "zh" ? "我的天空" : "My sky");
        setPanel(null);
        setNotice(null);
      },
      () => setNotice(c.denied),
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 600000 },
    );
  }, [c.denied, c.locating, fetchWeather, locale, userLocation]);

  const requestLocation = useCallback((intent: Exclude<LocationIntent, null> = "locate") => {
    if (userLocation) {
      locateUser();
      return;
    }
    setLocationIntent(intent);
    setLocationGate(true);
  }, [locateUser, userLocation]);

  const allowLocation = () => {
    setLocationGate(false);
    window.sessionStorage.setItem("kindchain-location-choice", "allow");
    locateUser();
    setLocationIntent(null);
  };
  const exploreWithoutLocation = () => {
    setLocationGate(false);
    window.sessionStorage.setItem("kindchain-location-choice", "later");
    if (locationIntent === "nearby") setPanel("nearby");
    setLocationIntent(null);
  };
  const enterNeighborhood = useCallback(() => {
    setNearView(true);
    setPanel(null);
    setZoom(1);
    setMapZoom(MAP_ENTRY_ZOOM);
  }, []);
  const nudgeEarthZoom = useCallback((delta: number) => {
    if (nearView) {
      setMapZoomCommand((current) => ({ delta, nonce: current.nonce + 1 }));
    } else {
      const stops = GLOBE_ZOOM_STOPS;
      const currentIndex = stops.reduce((best, stop, index) => Math.abs(stop - zoom) < Math.abs(stops[best] - zoom) ? index : best, 0);
      const nextIndex = Math.max(0, Math.min(stops.length - 1, currentIndex + (delta < 0 ? 1 : -1)));
      const cameraRange = 9.2 - 2.92;
      setZoomCommand((current) => ({ delta: (zoom - stops[nextIndex]) * cameraRange, nonce: current.nonce + 1 }));
    }
  }, [nearView, zoom]);
  const exitNeighborhoodByZoom = useCallback(() => {
    setNearView(false);
    setPanel(null);
    setMapZoom(MAP_ENTRY_ZOOM);
    setZoomCommand((current) => ({ delta: .72, nonce: current.nonce + 1 }));
  }, []);
  const handleEarthZoom = useCallback((nextZoom: number) => {
    setZoom(nextZoom);
    setPanel((current) => current === "region" ? null : current);
  }, []);

  const openCompose = (mode: ComposeMode, scene: ComposeScene = null) => {
    setComposeMode(mode);
    setComposeScene(scene);
    setComposeStep(1);
    setDraftText("");
    setDelivery("random");
    setPanel("compose");
  };

  const openActivityScene = (scene: Exclude<ComposeScene, null>) => {
    if (scene === "night-watch" && watchChain?.list[0]) {
      const story = watchChain.list[0];
      setSelectedId(story.id);
      setFocus((current) => ({ lat: story.lat, lon: story.lon, nonce: current.nonce + 1 }));
      void fetchWeather(story.lat, story.lon, story.region);
      openCompose("reply", scene);
      return;
    }
    setComposeMode("light");
    setComposeScene(scene);
    if (scene === "region-choir" || scene === "weather-shelter") {
      setDelivery("place");
      setPickedPlace({ lat: location.lat, lon: location.lon });
    } else {
      setDelivery("random");
    }
    setPanel("compose");
  };

  const openJourney = (journey: Journey, cinematic = false) => {
    setActiveJourneyId(journey.id);
    setJourneyView(cinematic);
    setNearView(false);
    setEarthHidden(false);
    setPanel(cinematic ? null : "journeys");
    setFocus((current) => ({ lat: journey.to.lat, lon: journey.to.lon, nonce: current.nonce + 1 }));
  };

  const submitStory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draftText.trim();
    if (!text) return;
    if (courierMode === "pigeon" && activePigeonFlights >= pigeonProfile.slots) {
      setNotice(extra.pigeonBusy);
      return;
    }
    eventCounterRef.current += 1;
    const sequence = eventCounterRef.current;
    const createdAt = Date.now();
    const idSeed = `${createdAt.toString(36)}-${sequence.toString(36)}-${stableHash(text).toString(36)}`;
    const detectedLanguage = detectTextLocale(text);
    const randomPlaces = [{ lat: 64.1, lon: -21.9 }, { lat: 1.35, lon: 103.82 }, { lat: -33.9, lon: 18.42 }, { lat: 41.9, lon: 12.5 }];
    let target = randomPlaces[sequence % randomPlaces.length];
    if (composeMode === "reply" && selected) target = { lat: selected.lat, lon: selected.lon };
    if (delivery === "nearby") target = { lat: senderOrigin.lat + ((sequence % 7) - 3) * .09, lon: senderOrigin.lon + ((sequence % 5) - 2) * .11 };
    if (delivery === "place" && pickedPlace) target = pickedPlace;
    target = coarsePublicPoint(target);
    const origin = userLocation ? activityOriginFor(userLocation, senderOrigin.label) : undefined;
    const newStory: Story = {
      id: `local-${idSeed}`, chain: composeMode === "reply" && selected ? selected.chain : `path-${idSeed}`, lat: target.lat, lon: target.lon,
      region: delivery === "nearby" ? (locale === "zh" ? "你的附近" : "Near you") : (locale === "zh" ? "地球某处" : "Somewhere on Earth"),
      country: "Earth", lang: detectedLanguage, text, translations: {}, replies: [], kind: composeMode === "wish" ? "wish" : "light",
      createdAt, expiresAt: createdAt + (composeMode === "wish" ? 48 : 24) * 3600000,
      origin, authorDayKey: actorDayKeyRef.current, scene: composeScene ?? undefined,
    };
    let journeyStoryId = newStory.id;
    if (composeMode === "reply" && selected) {
      const reply: Reply = {
        id: `reply-${idSeed}`, lang: detectedLanguage, text, translations: {},
        ...(userLocation ? {
          ...coarsePublicPoint(senderOrigin),
          region: senderOrigin.label,
        } : { region: locale === "zh" ? "私密天空" : "Private sky" }),
        country: "Earth", createdAt, origin, authorDayKey: actorDayKeyRef.current, scene: composeScene ?? undefined,
      };
      setStories((items) => items.map((item) => item.id === selected.id ? {
        ...item,
        replies: [...item.replies, reply],
        expiresAt: item.expiresAt ? Math.min((item.createdAt ?? createdAt) + 72 * 3600000, item.expiresAt + 6 * 3600000) : item.expiresAt,
      } : item));
      journeyStoryId = selected.id;
    } else {
      setStories((items) => [...items, newStory]);
      setSelectedId(newStory.id);
      setFocus((current) => ({ lat: target.lat, lon: target.lon, nonce: current.nonce + 1 }));
    }
    const route = estimateRoute(courierMode, senderOrigin, target);
    const newJourney: Journey = {
      id: `journey-${sequence}`, storyId: journeyStoryId, mode: courierMode,
      from: senderOrigin,
      to: { lat: target.lat, lon: target.lon, label: composeMode === "reply" && selected ? selected.region : delivery === "nearby" ? c.near : delivery === "place" ? c.selected : (locale === "zh" ? "地球某处" : "Somewhere on Earth") },
      ...route, startedAt: Date.now(), demoDurationMs: Math.max(45000, Math.min(150000, (48000 + route.distance * 5) * (courierMode === "pigeon" ? 1.18 - pigeonProfile.variant * .13 : 1))),
      courierVariant: courierMode === "pigeon" ? pigeonProfile.variant : 0,
      flockSize: courierMode === "pigeon" ? pigeonProfile.flock : 1,
    };
    setJourneys((items) => [newJourney, ...items]);
    setActiveJourneyId(newJourney.id);
    setMessengerMemory((memory) => ({
      replies: memory.replies + (composeMode === "reply" ? 1 : 0),
      distanceKm: memory.distanceKm + route.distance,
      weatherMarks: memory.weatherMarks + (environment.weather === "storm" || environment.weather === "snow" || environment.hazard !== "none" ? 1 : 0),
      escorts: memory.escorts + 1,
    }));
    event.currentTarget.reset();
    setDraftText("");
    setComposeStep(1);
    setComposeScene(null);
    setPanel(null);
    if (composeMode === "reply" && selected) {
      setReplyCeremony({ region: selected.region, weather: `${weatherIcon(environment)} ${Math.round(weather.temperature)}°`, localTime, message: text });
      window.setTimeout(() => setReplyCeremony(null), 4600);
    } else {
      setNotice(c.sent);
      window.setTimeout(() => setNotice(null), 3500);
    }
  };

  const requestRelay = async (chain: (typeof chains)[number]) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#star-path-${encodeURIComponent(chain.name)}`;
    const shareText = locale === "zh"
      ? `这条限时星链正在等待下一句文字接力：${chain.starCount} 颗星，${chain.countries} 个地区。`
      : `This fading KindChain constellation is waiting for one more text relay: ${chain.starCount} stars across ${chain.countries} places.`;
    try {
      if (navigator.share) await navigator.share({ title: "KindChain · Star Relay", text: shareText, url: shareUrl });
      else await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setNotice(extra.shared);
    } catch {
      setNotice(locale === "zh" ? "分享已取消，星链仍在等待真实接力。" : "Sharing was cancelled; the constellation is still waiting for a real relay.");
    }
  };

  const captureStarPath = (chain: (typeof chains)[number]) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const seed = stableHash(`${chain.name}-${chain.starCount}-${nasaDate}`);
    const proof = `STAR-PATH-${seed.toString(16).padStart(8, "0").toUpperCase()}${stableHash(`${seed}-${chain.countries}`).toString(16).slice(0, 8).toUpperCase()}`;
    const sky = ctx.createRadialGradient(820, 520, 40, 800, 500, 940);
    sky.addColorStop(0, environment.time === "day" ? "#244a68" : environment.time === "dawn" ? "#6a415d" : "#19183d");
    sky.addColorStop(.46, "#0a0d24");
    sky.addColorStop(1, "#02030a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 180; i++) {
      const h = stableHash(`${seed}-star-${i}`);
      const x = h % canvas.width;
      const y = (h >>> 11) % 720;
      const radius = .6 + ((h >>> 20) % 16) / 10;
      ctx.globalAlpha = .18 + ((h >>> 7) % 58) / 100;
      ctx.fillStyle = i % 11 === 0 ? "#d8c3ff" : "#eef5ff";
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const earth = ctx.createRadialGradient(700, 760, 40, 800, 930, 520);
    earth.addColorStop(0, "#557fab"); earth.addColorStop(.45, "#1d4f6a"); earth.addColorStop(.78, "#102940"); earth.addColorStop(1, "#030813");
    ctx.save();
    ctx.beginPath(); ctx.arc(800, 1085, 520, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = earth; ctx.fillRect(250, 550, 1100, 520);
    ctx.globalAlpha = .25; ctx.strokeStyle = "#9ed6e4"; ctx.lineWidth = 10;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.ellipse(800, 930 + i * 42, 470 - i * 34, 75, -.08, 0, Math.PI * 2); ctx.stroke(); }
    const solar = subsolarPoint(new Date(now));
    ctx.globalAlpha = .82; ctx.fillStyle = "#01030a";
    ctx.beginPath(); ctx.ellipse(800 - solar.lon * 2.2, 875 - solar.lat * 1.3, 360, 620, -.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1; ctx.strokeStyle = "rgba(141,219,238,.48)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(800, 1085, 520, Math.PI, Math.PI * 2); ctx.stroke();

    const nodes = chain.list.flatMap((story) => [{ id: story.id, lat: story.lat, lon: story.lon, parent: null as string | null }, ...story.replies.map((reply) => ({
      id: reply.id, lat: reply.lat ?? story.lat + ((stableHash(reply.id) % 9) - 4) * .3,
      lon: reply.lon ?? story.lon + ((stableHash(`${reply.id}-lon`) % 9) - 4) * .4, parent: story.id,
    }))]);
    const points = new Map(nodes.map((node, index) => {
      const angle = (stableHash(node.id) % 628) / 100 + index * .61;
      const ring = 90 + (index % 4) * 62;
      return [node.id, { x: 800 + Math.cos(angle) * ring * (1 + index / Math.max(8, nodes.length * 2)), y: 390 + Math.sin(angle) * ring * .58 }] as const;
    }));
    ctx.lineWidth = 3;
    chain.list.forEach((story, storyIndex) => {
      const point = points.get(story.id);
      const previous = storyIndex ? points.get(chain.list[storyIndex - 1].id) : null;
      if (point && previous) {
        ctx.strokeStyle = "rgba(194,166,255,.42)"; ctx.setLineDash([14, 10]);
        ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.quadraticCurveTo(800 + (storyIndex % 2 ? 130 : -130), 280 - storyIndex * 10, point.x, point.y); ctx.stroke();
      }
      story.replies.forEach((reply) => {
        const child = points.get(reply.id); if (!point || !child) return;
        ctx.strokeStyle = "rgba(126,232,205,.5)"; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.quadraticCurveTo((point.x + child.x) / 2, Math.min(point.y, child.y) - 28, child.x, child.y); ctx.stroke();
      });
    });
    ctx.setLineDash([]);
    nodes.forEach((node, index) => {
      const point = points.get(node.id); if (!point) return;
      const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 22);
      glow.addColorStop(0, index % 3 === 0 ? "#fff0bd" : "#e4d7ff"); glow.addColorStop(.2, "rgba(190,158,255,.9)"); glow.addColorStop(1, "rgba(145,105,255,0)");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(point.x, point.y, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(point.x, point.y, 3.2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = "rgba(245,241,255,.92)"; ctx.font = "52px Georgia, serif"; ctx.textAlign = "center";
    ctx.fillText(constellationName(chain.name, locale).toUpperCase(), 800, 105);
    ctx.fillStyle = "rgba(208,201,221,.62)"; ctx.font = "18px monospace";
    ctx.fillText(`${chain.starCount} STARS · ${chain.countries} REGIONS · NASA ${nasaDate}`, 800, 145);
    ctx.fillStyle = "rgba(215,199,255,.72)"; ctx.font = "21px monospace"; ctx.fillText(proof, 800, 680);
    ctx.fillStyle = "rgba(255,255,255,.32)"; ctx.font = "15px monospace"; ctx.fillText(extra.notOnChain.toUpperCase(), 800, 713);
    ctx.save(); ctx.translate(1390, 560); ctx.rotate(-Math.PI / 2); ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.font = "42px monospace"; ctx.fillText("NOT ON-CHAIN", 0, 0); ctx.restore();
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `${proof}.png`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(extra.saved);
    }, "image/png");
  };

  const drift = () => {
    eventCounterRef.current += 1;
    selectStory(stories[eventCounterRef.current % stories.length]);
  };
  const sceneLabel = environmentLabel(environment);
  const mapBlend = nearView ? 1 : Math.max(0, Math.min(1, (zoom - .78) / .22));
  const mapVisible = nearView || mapBlend > .01;
  const localProgress = Math.max(0, Math.min(1, (mapZoom - MAP_ENTRY_ZOOM) / (MAP_MAX_ZOOM - MAP_ENTRY_ZOOM)));
  const depthProgress = nearView ? .78 + localProgress * .22 : Math.min(.78, zoom * .78);
  const zoomStage = nearView
    ? mapZoom >= 13.15 ? "COMMUNITY" : mapZoom >= 12.35 ? "DISTRICT" : mapZoom >= 11.45 ? "CITY" : "REGION"
    : zoom >= .84 ? "REGION" : zoom >= .66 ? "COUNTRY" : zoom >= .48 ? "CONTINENT" : zoom >= .2 ? "EARTH" : "ORBIT";
  const courierScale = Math.max(.4, .98 - depthProgress * .58);
  const currentZone = zoneFor(location.lat, location.lon);
  const solarPoint = subsolarPoint(new Date(now));
  const solarX = ((solarPoint.lon + 180) / 360) * 100;
  const terminatorMax = Math.max(1, terminatorPulse.day, terminatorPulse.night);
  const dayBridgeProgress = Math.max(8, (terminatorPulse.day / terminatorMax) * 100);
  const nightBridgeProgress = Math.max(8, (terminatorPulse.night / terminatorMax) * 100);
  const currentBandLabel = currentActivity ? pulse.bands[currentActivity.band] : pulse.ordinary;
  const watchCountdown = watchChain?.expiresAt ? formatCountdown(watchChain.expiresAt - now) : "∞";

  return (
    <main className={`world-app time-${environment.time} weather-${environment.weather} biome-${environment.biome} hazard-${environment.hazard} zone-${currentZone} ${environment.aurora ? "aurora-active" : ""} ${zoom > .65 ? "is-near" : ""} ${nearView ? "near-map-open" : ""} ${journeyView ? `journey-view journey-${activeJourney?.mode ?? "pigeon"}` : ""} ${earthHidden ? "earth-hidden" : ""}`} style={{ "--earth-zoom": String(zoom), "--earth-opacity": String(1 - mapBlend * .9), "--courier-scale": String(courierScale), "--solar-x": `${solarX}%` } as CSSProperties}>
      <WeatherWall environment={environment} />
      {journeyView && activeJourney && <JourneyStage journey={activeJourney} locale={locale} earthHidden={earthHidden} onToggleEarth={() => setEarthHidden((value) => !value)} onExit={() => { setJourneyView(false); setEarthHidden(false); setPanel("journeys"); }} />}
      <LivingWorld stories={stories} activity={dailyActivity} journeys={journeys} activeJourneyId={activeJourneyId} textureUrl={textureUrl} baseTextureUrl={baseTextureUrl} homePoint={userLocation} selectedId={selectedId} focus={focus} zoomCommand={zoomCommand} onSelect={selectStory} onPick={pickEarth} onZoom={handleEarthZoom} onNear={enterNeighborhood} />
      {mapVisible && <NeighborhoodMap point={location} label={location.label} locale={locale} globeZoom={zoom} interactive={nearView} blend={mapBlend} zoomCommand={mapZoomCommand} onZoomChange={setMapZoom} onExitZoom={exitNeighborhoodByZoom} onPick={pickEarth} />}

      <header className="world-header">
        <button className="kc-brand" onClick={() => setPanel(panel === "menu" ? null : "menu")} aria-label={c.menu}>
          <span className="kc-orbit"><i /><i /><b>✦</b></span>
          <span><strong>KindChain</strong><small>GALAXY OF KINDNESS</small></span>
        </button>
        <button className="sky-pill" onClick={() => setPanel(panel === "region" ? null : "region")}>
          <i>{weatherIcon(environment)}</i>
          <span><small>{c.live} · {sceneLabel}</small><strong>{location.label}</strong></span>
          <b>{Math.round(weather.temperature)}°</b><em>{localTime}</em>
        </button>
        <div className="header-tools">
          <button className={userLocation ? "home-ready" : ""} onClick={() => requestLocation("locate")} aria-label={c.locate} title={c.locate}>⌖</button>
          <button className={sound ? "active" : ""} onClick={() => setSound(!sound)} aria-label={sound ? c.soundOff : c.soundOn} title={sound ? c.soundOff : c.soundOn}>{sound ? "◖))" : "◖×"}</button>
          <button onClick={() => setLocaleMenu(!localeMenu)} aria-label={c.choose}>{locale.toUpperCase()}</button>
          <button onClick={() => setPanel(panel === "menu" ? null : "menu")} aria-label={c.menu}>⋮</button>
        </div>
        {localeMenu && (
          <div className="locale-menu">
            {Object.entries(LOCALE_NAMES).map(([code, name]) => <button key={code} className={locale === code ? "active" : ""} onClick={() => { setLocale(code as Locale); setLocaleMenu(false); }}>{name}<span>{code.toUpperCase()}</span></button>)}
          </div>
        )}
      </header>

      <div className="zoom-controls" aria-label="Earth zoom controls">
        <button className="zoom-step" onClick={() => nudgeEarthZoom(-1.3)} aria-label="Zoom in Earth">＋</button>
        <div className="zoom-readout" role="status" aria-label={`Current zoom layer: ${zoomStage}`}><i style={{ height: `${12 + depthProgress * 42}px` }} /><span>{zoomStage}</span></div>
        <button className="zoom-step" onClick={() => nudgeEarthZoom(1.3)} aria-label="Zoom out Earth">−</button>
      </div>
      <p className="drag-hint">{c.drag}</p>
      <button type="button" className={`solar-legend band-${currentActivity?.band ?? "quiet"}`} aria-label={pulse.title} onClick={() => setPanel(panel === "pulse" ? null : "pulse")}>
        <span><b>☼</b>{locale === "zh" ? "白昼" : "DAY"}</span><i><u /></i><span><b>☾</b>{locale === "zh" ? "黑夜" : "NIGHT"}</span>
        <small>{locale === "zh" ? "实时晨昏线" : "LIVE TERMINATOR"} · {Math.abs(solarPoint.lat).toFixed(1)}°{solarPoint.lat >= 0 ? "N" : "S"} / {Math.abs(solarPoint.lon).toFixed(1)}°{solarPoint.lon >= 0 ? "E" : "W"}</small>
        <em><i />{activityTotals.textCount} {pulse.signals}</em>
      </button>

      {panel === "story" && selected && (
        <section className="story-panel floating-panel">
          <div className="panel-head">
            <span className={`signal-type ${selected.kind === "wish" ? "wish" : ""}`}>{selected.kind === "wish" ? "♡ WISH SIGNAL" : "✦ HUMAN SIGNAL"}</span>
            <button onClick={() => setPanel(null)} aria-label={c.close}>×</button>
          </div>
          <div className="story-place"><i />{selected.region} · {selected.country}<span>{selected.lang.toUpperCase()}</span></div>
          <blockquote>“{storyText(selected, locale, showOriginal)}”</blockquote>
          <div className="translation-switch">
            <button className={showOriginal ? "active" : ""} onClick={() => setShowOriginal(true)}>{c.original}</button>
            <button className={!showOriginal ? "active" : ""} onClick={() => setShowOriginal(false)}>✦ {c.translate}</button>
          </div>
          {selected.replies.length > 0 && <div className="reply-thread">
            {selected.replies.map((reply) => <div key={reply.id}><span>{reply.lang.toUpperCase()}</span><p>{replyText(reply, locale, showOriginal)}</p></div>)}
          </div>}
          <div className="story-actions">
            <button className="soft-button" onClick={() => openCompose("reply")}>↳ {c.reply}</button>
            <button className="icon-button" aria-label={c.hold}>♡</button>
          </div>
        </section>
      )}

      {panel === "region" && (
        <section className="region-panel floating-panel">
          <div className="panel-head"><span>{weatherIcon(environment)} {c.region}</span><button onClick={() => setPanel(null)} aria-label={c.close}>×</button></div>
          <div className="region-sigil"><i /><i /><b>{weatherIcon(environment)}</b></div>
          <h2>{location.label}</h2>
          <p>{Math.abs(location.lat).toFixed(1)}°{location.lat >= 0 ? "N" : "S"} · {Math.abs(location.lon).toFixed(1)}°{location.lon >= 0 ? "E" : "W"}</p>
          <div className="environment-tags"><span>{seasonFor(location.lat)}</span><span>{environment.biome.toUpperCase()}</span><span>{sceneLabel}</span>{environment.aurora && <span>NOAA {Math.round(environment.auroraChance)}%</span>}</div>
          <div className="weather-grid">
            <span><small>TEMP</small><b>{Math.round(weather.temperature)}°</b></span>
            <span><small>FEELS</small><b>{Math.round(weather.apparent)}°</b></span>
            <span><small>WIND</small><b>{Math.round(weather.wind)}</b></span>
            <span><small>HUMID</small><b>{Math.round(weather.humidity)}%</b></span>
          </div>
          <button className={`region-resonance band-${currentActivity?.band ?? "quiet"}`} onClick={() => setPanel("pulse")}>
            <i><b /></i>
            <span><small>{pulse.title} · 24H</small><strong>{currentBandLabel}</strong></span>
            <em>{currentActivity?.textCount ?? 0}<small>{locale === "zh" ? "束" : "TEXTS"}</small></em>
          </button>
          <div className="sound-line"><i className={sound ? "playing" : ""} /><span>{environment.weather === "rain" ? "Rain · distant ambient" : environment.weather === "snow" ? "Snow hush · soft wind" : environment.weather === "storm" ? "Storm · deep air" : environment.hazard === "dust" ? "Desert wind · warm air" : environment.time === "night" ? "Night air · low ambient" : "Open sky · warm ambient"}</span><button onClick={() => setSound(!sound)}>{sound ? "Ⅱ" : "▶"}</button></div>
          <small className="data-source">{c.source} · NOAA SWPC · {nasaDate}</small>
        </section>
      )}

      {panel === "pulse" && (
        <section className="pulse-panel floating-panel wide-panel">
          <div className="panel-head"><span>✦ {pulse.title}</span><button onClick={() => setPanel(null)} aria-label={c.close}>×</button></div>
          <div className={`pulse-overview band-${currentActivity?.band ?? "quiet"}`}>
            <div className="pulse-orbit"><i /><i /><b>✦</b></div>
            <span><small>{location.label}</small><strong>{currentBandLabel}</strong><em>{currentActivity ? `${currentActivity.textCount} ${pulse.signals}` : pulse.ordinary}</em></span>
            <div><b>{activityTotals.textCount}</b><small>{pulse.global}</small><em>+{activityTotals.recentCount} {pulse.recent}</em></div>
          </div>
          <div className="density-scale" aria-label="Activity brightness scale">
            {(["quiet", "glimmer", "radiant", "surge"] as ActivityBand[]).map((band) => <span key={band} className={`band-${band}`}><i />{pulse.bands[band]}</span>)}
          </div>
          <div className="light-scenes">
            <article className="scene-card terminator-scene">
              <div><i>☼↝☾</i><span><small>01 · LIGHT MATCH</small><strong>{pulse.terminator}</strong></span></div>
              <p>{pulse.terminatorCopy}</p>
              <div className="duet-meter">
                <span><small>DAY · {terminatorPulse.day}</small><i><b style={{ width: `${dayBridgeProgress}%` }} /></i></span>
                <span><small>NIGHT · {terminatorPulse.night}</small><i><b style={{ width: `${nightBridgeProgress}%` }} /></i></span>
              </div>
              <button onClick={() => openActivityScene("terminator")}>{pulse.sendAcross}<b>→</b></button>
            </article>
            <article className="scene-card choir-scene">
              <div><i>✣</i><span><small>02 · CO-OP SHAPE</small><strong>{pulse.choir}</strong></span></div>
              <p>{pulse.choirCopy}</p>
              <div className="scene-count"><span>{choirProgress}</span><i>{Array.from({ length: choirGoal }, (_, index) => <b key={index} className={index < choirProgress ? "lit" : ""} />)}</i><em>/ {choirGoal}</em></div>
              <button onClick={() => openActivityScene("region-choir")}>{pulse.addVoice}<b>→</b></button>
            </article>
            <article className="scene-card watch-scene">
              <div><i>◔</i><span><small>03 · AGAINST TIME</small><strong>{pulse.watch}</strong></span></div>
              <p>{pulse.watchCopy}</p>
              <div className="watch-clock"><span>{watchCountdown}</span><small>{watchChain ? constellationName(watchChain.name, locale) : "—"}</small></div>
              <button disabled={!watchChain} onClick={() => openActivityScene("night-watch")}>{pulse.relayNow}<b>→</b></button>
            </article>
            <article className={`scene-card shelter-scene weather-${environment.weather} hazard-${environment.hazard}`}>
              <div><i>{weatherIcon(environment)}</i><span><small>04 · WEATHER CO-OP</small><strong>{pulse.shelter}</strong></span></div>
              <p>{pulse.shelterCopy}</p>
              <div className="shelter-dome"><i /><span>{shelterProgress} / 3</span>{Array.from({ length: 3 }, (_, index) => <b key={index} className={index < shelterProgress ? "lit" : ""} />)}</div>
              <button onClick={() => openActivityScene("weather-shelter")}>{pulse.shelterAction}<b>→</b></button>
            </article>
          </div>
          <p className="pulse-ethic">◇ {pulse.noRank}</p>
          <small className="pulse-source">{pulse.sample} · NASA {nasaDate} · {dailyActivity.version.toUpperCase()}</small>
        </section>
      )}

      {panel === "nearby" && (
        <section className="nearby-panel floating-panel">
          <div className="panel-head"><span>⌁ {c.nearbyTitle}</span><button onClick={() => setPanel(null)} aria-label={c.close}>×</button></div>
          <div className="near-list">
            {nearbyStories.map((story) => <button key={story.id} onClick={() => selectStory(story)}><i className={story.kind === "wish" ? "wish" : ""}>{story.kind === "wish" ? "♡" : "✦"}</i><span><small>{story.region} · {Math.round(distanceKm(location, story)).toLocaleString()} km</small>{storyText(story, locale, false)}</span><b>→</b></button>)}
          </div>
          <p className="privacy-line">⌁ {c.privacy}</p>
        </section>
      )}

      {panel === "archive" && (
        <section className="archive-panel floating-panel wide-panel">
          <div className="panel-head"><span>⌘ {c.archiveTitle}</span><button onClick={() => setPanel(null)} aria-label={c.close}>×</button></div>
          <p className="archive-intro">{extra.relay} · {locale === "zh" ? "真实留言与回复会成为真实星点；新的文字接力才会延长限时星系。" : "Real messages and replies become real stars; only a new text relay extends a fading constellation."}</p>
          <div className="chain-list">
            {chains.map((chain) => {
              const mini = miniConstellationLayout(chain.list);
              return <article key={chain.name} className={`chain-card rarity-${chain.rarity}`}>
                <button className="chain-open" onClick={() => selectStory(chain.list[0])} aria-label={chain.name}>
                  <svg className="mini-constellation" viewBox="0 0 100 100" role="img" aria-label={`${chain.starCount} connected stars`}>
                    {mini.edges.map((edge, index) => <path key={`${edge.from.id}-${edge.to.id}-${index}`} className={edge.reply ? "reply-edge" : "relay-edge"} d={`M ${edge.from.x} ${edge.from.y} Q 50 ${Math.max(7, Math.min(edge.from.y, edge.to.y) - 13)} ${edge.to.x} ${edge.to.y}`} />)}
                    {mini.points.map((point) => <circle key={point.id} className={point.root ? "root-star" : "reply-star"} cx={point.x} cy={point.y} r={point.root ? 2.5 : 1.7} />)}
                  </svg>
                  <span><small>{c.rarity[chain.rarity].toUpperCase()} · {constellationName(chain.name, locale)}</small><strong>{chain.starCount} {c.stars} · {chain.countries} {c.countries}</strong></span><b>↗</b>
                </button>
                <div className="chain-life"><span className={chain.expiresAt && chain.expiresAt - now < 3600000 ? "fading" : ""}><i />{chain.expiresAt ? `${formatCountdown(chain.expiresAt - now)} ${extra.expiring}` : "DEMO CONSTELLATION · ∞"}</span><small>{extra.proof} · {stableHash(`${chain.name}-${chain.starCount}`).toString(16).toUpperCase()}</small></div>
                <div className="chain-actions">
                  <button onClick={() => captureStarPath(chain)}>◉ {extra.capture}</button>
                  <button onClick={() => void requestRelay(chain)}>↗ {extra.share}</button>
                  <button onClick={() => setNotice(extra.chainLater)}>◇ {extra.preserve}<small>{extra.notOnChain}</small></button>
                </div>
              </article>;
            })}
          </div>
        </section>
      )}

      {panel === "journeys" && (
        <section className="journeys-panel floating-panel wide-panel">
          <div className="panel-head"><span>⌁ {locale === "zh" ? "旅程观测站" : "JOURNEY OBSERVATORY"}</span><button onClick={() => setPanel(null)} aria-label={c.close}>×</button></div>
          {journeys.length === 0 ? <p className="empty-journeys">{c.noJourneys}</p> : <div className="journey-list">
            {journeys.map((journey) => {
              const spec = TRANSPORTS[journey.mode];
              const progress = journeyProgress(journey);
              return <button key={journey.id} className={journey.id === activeJourneyId ? "active" : ""} onClick={() => openJourney(journey)}>
                <i className={`courier-medallion mode-${journey.mode}`}>{spec.glyph}</i>
                <span><small>{spec.names[locale]} · {progress >= 1 ? (locale === "zh" ? "已抵达并点亮" : "ARRIVED · STAR LIT") : c.inFlight}</small><strong>{journey.from.label} <em>→</em> {journey.to.label}</strong><u><i style={{ width: `${progress * 100}%` }} /></u></span>
                <b>{Math.round(journey.distance).toLocaleString()}<small>KM</small></b>
              </button>;
            })}
          </div>}
          {activeJourney && <button className="cinema-button" onClick={() => openJourney(activeJourney, true)}><span>◉</span>{c.cinema}<b>→</b></button>}
        </section>
      )}

      {panel === "menu" && (
        <section className="menu-panel floating-panel">
          <div className="panel-head"><span>✦ {c.menu}</span><button onClick={() => setPanel(null)} aria-label={c.close}>×</button></div>
          <div className="menu-glyph"><div className="kc-orbit"><i /><i /><b>✦</b></div></div>
          <div className="system-grid">{c.menuItems.map((item, i) => <button key={item} onClick={() => i === 1 ? setPanel("archive") : i === 3 ? setPanel("journeys") : i === 5 ? openCompose("wish") : undefined}><i>0{i + 1}</i><span>{item}</span><b>{[1,3,5].includes(i) ? "→" : "ON"}</b></button>)}</div>
          <small>KindChain · Galaxy of Kindness · 3D couriers: Quaternius / elkiotbear via Poly Pizza</small>
        </section>
      )}

      {panel === "compose" && (
        <section className="compose-panel floating-panel">
          <div className="panel-head"><span>{composeMode === "wish" ? "♡ WISH" : composeMode === "reply" ? "↳ REPLY" : "✦ NEW LIGHT"}</span><button onClick={() => setPanel(null)} aria-label={c.close}>×</button></div>
          <div className="compose-progress" aria-label={locale === "zh" ? `写信步骤 ${composeStep}` : `Compose step ${composeStep}`}>
            <span className={composeStep >= 1 ? "active" : ""}><i>1</i>{locale === "zh" ? "写一句" : "WRITE"}</span>
            {composeMode !== "reply" && <><b /><span className={composeStep >= 2 ? "active" : ""}><i>2</i>{locale === "zh" ? "选信使" : "MESSENGER"}</span><b /><span className={composeStep >= 3 ? "active" : ""}><i>3</i>{locale === "zh" ? "去哪里" : "DESTINATION"}</span></>}
          </div>
          {composeScene && <div className={`compose-scene scene-${composeScene}`}><i>✦</i><span><small>LIVE CO-OP SCENE</small><strong>{pulse.compose[composeScene]}</strong></span></div>}
          {composeMode === "reply" && selected && <blockquote>“{storyText(selected, locale, false)}”</blockquote>}
          <form onSubmit={submitStory}>
            {composeStep === 1 && <div className="compose-step compose-write-step">
              <textarea name="message" required autoFocus maxLength={600} value={draftText} onChange={(event) => setDraftText(event.target.value)} placeholder={composeMode === "wish" ? c.wishText : composeMode === "reply" ? c.response : c.message} />
              <p className="auto-translate"><b>{extra.textOnly}</b><span>{draftText.length} / 600 · {c.auto}</span></p>
              <div className="compose-actions"><button type="button" onClick={() => setPanel(null)}>{c.cancel}</button>{composeMode === "reply" ? <button type="submit" disabled={!draftText.trim()}>{locale === "zh" ? "让回应发光" : "Let it glow"} <b>→</b></button> : <button type="button" disabled={!draftText.trim()} onClick={() => setComposeStep(2)}>{locale === "zh" ? "选择信使" : "Choose a messenger"} <b>→</b></button>}</div>
            </div>}
            {composeMode !== "reply" && composeStep === 2 && <div className="compose-step">
              <div className={`pigeon-nest nest-${pigeonProfile.tint}`}>
                <div className="nest-bird"><i /><i /><b>◇</b>{pigeonProfile.flock > 1 && <em>+{pigeonProfile.flock - 1}</em>}</div>
                <div className="nest-copy"><small>LV.0{pigeonProfile.level} · {extra.pigeonNest}</small><strong>{pigeonProfile.name}</strong><span>{pigeonProfile.score} {extra.shares} · {messengerMemory.replies} {locale === "zh" ? "次回应" : "replies"} · {Math.round(messengerMemory.distanceKm).toLocaleString()} km</span><u><i style={{ width: `${Math.min(100, (pigeonProfile.score / pigeonProfile.nextAt) * 100)}%` }} /></u></div>
              </div>
              <div className="courier-chooser">
                <div className="courier-title"><span>{c.courier}</span><small>{c.estimate} · {formatDuration(composeEstimate.etaHours, locale)}</small></div>
                <div className="courier-strip">
                  {TRANSPORT_ORDER.map((mode) => {
                    const spec = TRANSPORTS[mode];
                    return <button key={mode} type="button" className={courierMode === mode ? "active" : ""} onClick={() => setCourierMode(mode)} title={spec.names[locale]}><i>{spec.glyph}</i><span>{spec.names[locale]}</span><small>{spec.era[locale]}</small></button>;
                  })}
                </div>
              </div>
              <div className="compose-actions"><button type="button" onClick={() => setComposeStep(1)}>← {locale === "zh" ? "返回" : "Back"}</button><button type="button" onClick={() => setComposeStep(3)}>{locale === "zh" ? "选择目的地" : "Choose destination"} <b>→</b></button></div>
            </div>}
            {composeMode !== "reply" && composeStep === 3 && <div className="compose-step">
              <div className="delivery-tabs">
                <button type="button" className={delivery === "random" ? "active" : ""} onClick={() => setDelivery("random")}><i>⌁</i>{c.random}</button>
                <button type="button" className={delivery === "nearby" ? "active" : ""} onClick={() => setDelivery("nearby")}><i>⌖</i>{c.near}</button>
                <button type="button" className={delivery === "place" ? "active" : ""} onClick={() => setDelivery("place")}><i>◎</i>{c.place}</button>
              </div>
              {delivery === "place" && <p className="place-prompt">◎ {pickedPlace ? `${c.selected}: ${pickedPlace.lat.toFixed(1)}°, ${pickedPlace.lon.toFixed(1)}°` : c.place}</p>}
              <div className="route-estimate"><span>{senderOrigin.label}</span><i><b /></i><span>{composeTarget.label}</span><strong>{Math.round(composeEstimate.routeDistance).toLocaleString()} km</strong></div>
              <p className="departure-promise">{locale === "zh" ? "默认随缘去往地球某处。没有精确住址，也不会显示实时轨迹。" : "By default, it drifts somewhere on Earth. No exact address or live personal trail is shown."}</p>
              <div className="compose-actions"><button type="button" onClick={() => setComposeStep(2)}>← {locale === "zh" ? "返回" : "Back"}</button><button type="submit">{locale === "zh" ? "让它启程" : "Let it depart"} <b>→</b></button></div>
            </div>}
          </form>
        </section>
      )}

      <nav className="world-dock" aria-label="KindChain actions">
        <button onClick={drift}><i>✣</i><span>{c.drift}</span></button>
        <button onClick={() => userLocation || window.sessionStorage.getItem("kindchain-location-choice") ? setPanel(panel === "nearby" ? null : "nearby") : requestLocation("nearby")}><i>⌁</i><span>{c.nearby}</span></button>
        <button className="main-drop" onClick={() => openCompose("light")}><i>✦</i><span>{c.drop}</span></button>
        <button onClick={() => openCompose("wish")}><i>♡</i><span>{c.wish}</span></button>
        <button onClick={() => setPanel(panel === "archive" ? null : "archive")}><i>⌘</i><span>{c.archive}</span></button>
      </nav>

      {!journeyView && activeJourney && (
        <button className="journey-peek" onClick={() => setPanel(panel === "journeys" ? null : "journeys")}>
          <i className={`mode-${activeJourney.mode}`}>{TRANSPORTS[activeJourney.mode].glyph}</i>
          <span><small>{TRANSPORTS[activeJourney.mode].names[locale]} · {journeyProgress(activeJourney) >= 1 ? (locale === "zh" ? "已抵达" : "ARRIVED") : c.inFlight}</small><b>{activeJourney.from.label} → {activeJourney.to.label}</b></span>
          <em>{Math.round(journeyProgress(activeJourney) * 100)}%</em>
        </button>
      )}

      <div className="nasa-mark"><span className="live-dot" />NASA GIBS · {nasaDate}</div>
      <KindnessOnboarding locale={locale} stage={onboardingStage} onReceive={() => finishOnboarding(true)} onSkip={() => finishOnboarding(false)} />
      {replyCeremony && <ReplyArrivalCeremony locale={locale} ceremony={replyCeremony} onClose={() => setReplyCeremony(null)} />}
      {locationGate && <LocationGate locale={locale} onAllow={allowLocation} onLater={exploreWithoutLocation} />}
      {notice && <div className="notice" role="status"><i>✦</i>{notice}<button onClick={() => setNotice(null)}>×</button></div>}
    </main>
  );
}
