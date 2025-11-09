import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Lock, Shield, KeyRound, Plus, Eye, EyeOff, Trash2, Edit2, CheckCircle, XCircle, AlertCircle, Sparkles, ExternalLink, Mail, Cloud, Server, HardDrive, Key, Box, Database, AlertTriangle, Lock as LockIcon, FileKey, Cookie } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

// EFF Short Wordlist 2.0 - 1296 words (10.34 bits per word)
// 7 words = 72.4 bits of entropy (exceeds 64-bit production requirement)
const SECURE_WORDLIST = [
  "able","about","above","accept","acid","across","actor","adapt","admit","adopt","adult","advice","affair","afford","afraid","after","again","agency","agent","agree","ahead","alarm","album","alert","alien","align","alive","allow","almost","alone","along","already","also","alter","always","amaze","among","amount","amuse","anchor","angel","anger","angle","angry","ankle","annual","answer","anyone","anyway","apart","appeal","appear","apple","apply","april","area","arena","argue","arise","armor","army","around","arrow","artist","ashen","aside","asset","assume","attach","attack","attempt","attend","august","author","autumn","average","avoid","awake","aware","awful","back","bacon","badge","badly","baker","band","bank","barely","base","basin","basis","batch","beach","beam","bean","bear","beast","beauty","become","beef","before","begin","behalf","behave","behind","being","belief","bell","belly","belong","below","bench","bend","benefit","beside","best","better","beyond","bike","bind","bird","birth","bitter","black","blade","blame","blank","blast","blaze","bleed","blend","bless","blind","blink","block","blood","bloom","blow","blue","board","boat","body","boil","bold","bolt","bomb","bond","bone","bonus","book","boost","border","born","borrow","boss","both","bottle","bottom","bound","bowl","brain","branch","brand","brass","brave","bread","break","breed","brick","bridge","brief","bright","bring","brisk","broad","broken","bronze","brush","bubble","bucket","budget","build","built","bullet","bundle","burden","bureau","burst","busy","butter","button","buyer","cabin","cable","cage","cake","call","calm","camera","camp","campus","cancel","cancer","candle","candy","canvas","canyon","capable","capital","captain","capture","card","care","career","cargo","carpet","carry","case","cash","casino","cast","casual","catch","cattle","cause","cave","cease","cell","census","center","central","century","cereal","certain","chain","chair","chalk","chamber","chance","change","channel","chaos","chapter","charge","chart","chase","cheap","check","cheek","cheer","cheese","chef","cherry","chess","chest","chicken","chief","child","chimney","choice","choose","chorus","chronic","chunk","church","cinema","circle","citizen","city","civic","civil","claim","clap","clarify","clash","class","classic","claw","clay","clean","clear","clerk","clever","click","client","cliff","climb","clinic","clock","close","cloth","cloud","clown","club","cluster","coach","coast","coconut","code","coffee","coil","coin","cold","collar","collect","college","column","combat","combine","come","comedy","comfort","comic","command","comment","commit","common","company","compare","compass","compel","compete","compile","complex","comply","compose","compost","compute","concept","concern","concert","concur","conduct","confess","confirm","conform","confuse","connect","consent","consist","console","consult","contact","contain","content","contest","context","contour","control","convert","convict","convince","cook","cool","copper","copy","coral","core","corn","corner","correct","cosmic","cost","cotton","couch","cough","could","council","counsel","count","country","county","couple","courage","course","cousin","cover","cowboy","crack","cradle","craft","crash","crater","crawl","crazy","cream","credit","creek","creep","crew","cricket","crime","crisp","critic","crop","cross","crouch","crowd","crucial","cruel","cruise","crumble","crunch","crush","cry","crystal","cube","culture","cupboard","curious","current","curtain","curve","cushion","custom","cute","cycle","dad","damage","damp","dance","danger","daring","dark","data","dawn","deal","debate","debris","decade","decay","decent","decide","declare","decline","decor","decrease","deeply","deer","defeat","defend","define","defy","degree","delay","deliver","demand","demise","denial","dense","deny","depart","depend","deploy","deposit","depth","deputy","derive","describe","desert","deserve","design","desire","desk","despair","despite","destroy","detail","detect","develop","device","devote","diagram","dial","diamond","diary","dice","diet","differ","digital","dignity","dilemma","dinner","direct","dirt","disagree","discover","discuss","disease","dish","dismiss","disorder","display","distance","distant","district","disturb","ditch","dive","divide","divorce","dizzy","doctor","document","dodge","domain","domestic","donkey","donor","door","dose","double","dove","draft","dragon","drama","drastic","draw","dream","dress","drift","drill","drink","drip","drive","drop","drown","drum","dry","duck","dumb","dune","during","dust","duty","dwarf","dynamic","eager","eagle","early","earn","earth","easily","east","easy","echo","ecology","economy","edge","edit","educate","effort","eight","either","elbow","elder","elect","elegant","element","elephant","elevator","eleven","elite","else","email","embark","embody","embrace","emerge","emotion","employ","empower","empty","enable","enact","end","endless","endorse","enemy","energy","enforce","engage","engine","enhance","enjoy","enlist","enough","enrich","enroll","ensure","enter","entire","entry","envelope","episode","equal","equip","era","erase","erode","erosion","error","erupt","escape","essay","essence","estate","eternal","ethics","evidence","evil","evoke","evolve","exact","example","excess","exchange","excite","exclude","excuse","execute","exercise","exhaust","exhibit","exile","exist","exit","exotic","expand","expect","expire","explain","expose","express","extend","extra","eye","eyebrow","fabric","face","fact","fade","faint","faith","fall","false","fame","family","famous","fancy","fantasy","farm","fashion","fast","fatal","father","fatigue","fault","favorite","feature","february","federal","fee","feed","feel","female","fence","festival","fetch","fever","few","fiber","fiction","field","figure","file","film","filter","final","find","fine","finger","finish","fire","firm","first","fiscal","fish","fitness","fix","flag","flame","flash","flat","flavor","flee","flight","flip","float","flock","floor","flower","fluid","flush","fly","foam","focus","fog","foil","fold","follow","food","foot","force","forest","forget","fork","fortune","forum","forward","fossil","foster","found","fox","fragile","frame","frequent","fresh","friend","fringe","frog","front","frost","frown","frozen","fruit","fuel","fun","funny","furnace","fury","future","gadget","gain","galaxy","gallery","game","gap","garage","garbage","garden","garlic","garment","gas","gasp","gate","gather","gauge","gaze","general","genius","genre","gentle","genuine","gesture","ghost","giant","gift","giggle","ginger","giraffe","girl","give","glad","glance","glare","glass","glide","glimpse","globe","gloom","glory","glove","glow","glue","goal","goat","goddess","gold","good","goose","gorilla","gospel","gossip","govern","gown","grab","grace","grain","grant","grape","grass","gravity","great","green","grid","grief","grit","grocery","group","grow","grunt","guard","guess","guide","guilt","guitar","gun","gym","habit","hair","half","hammer","hamster","hand","happy","harbor","hard","harsh","harvest","hat","have","hawk","hazard","head","health","heart","heavy","hedgehog","height","hello","helmet","help","hen","hero","hidden","high","hill","hint","hip","hire","history","hobby","hockey","hold","hole","holiday","hollow","home","honey","hood","hope","horn","horror","horse","hospital","host","hotel","hour","hover","hub","huge","human","humble","humor","hundred","hungry","hunt","hurdle","hurry","hurt","husband","hybrid","ice","icon","idea","identify","idle","ignore","ill","illegal","illness","image","imitate","immense","immune","impact","impose","improve","impulse","inch","include","income","increase","index","indicate","indoor","industry","infant","inflict","inform","inhale","inherit","initial","inject","injury","inmate","inner","innocent","input","inquiry","insane","insect","inside","inspire","install","intact","interest","into","invest","invite","involve","iron","island","isolate","issue","item","ivory","jacket","jaguar","jar","jazz","jealous","jeans","jelly","jewel","job","join","joke","journey","joy","judge","juice","jump","jungle","junior","junk","just","kangaroo","keen","keep","ketchup","key","kick","kid","kidney","kind","kingdom","kiss","kit","kitchen","kite","kitten","kiwi","knee","knife","knock","know","lab","label","labor","ladder","lady","lake","lamp","language","laptop","large","later","latin","laugh","laundry","lava","law","lawn","lawsuit","layer","lazy","leader","leaf","learn","leave","lecture","left","leg","legal","legend","leisure","lemon","lend","length","lens","leopard","lesson","letter","level","liar","liberty","library","license","life","lift","light","like","limb","limit","link","lion","liquid","list","little","live","lizard","load","loan","lobster","local","lock","logic","lonely","long","loop","lottery","loud","lounge","love","loyal","lucky","luggage","lumber","lunar","lunch","luxury","lyrics","machine","mad","magic","magnet","maid","mail","main","major","make","mammal","man","manage","mandate","mango","mansion","manual","maple","marble","march","margin","marine","market","marriage","mask","mass","master","match","material","math","matrix","matter","maximum","maze","meadow","mean","measure","meat","mechanic","medal","media","melody","melt","member","memory","mental","mention","menu","mercy","merge","merit","merry","mesh","message","metal","method","middle","midnight","milk","million","mimic","mind","minimum","minor","minute","miracle","mirror","misery","miss","mistake","mix","mixed","mixture","mobile","model","modify","mom","moment","monitor","monkey","monster","month","moon","moral","more","morning","mosquito","mother","motion","motor","mountain","mouse","move","movie","much","muffin","mule","multiply","muscle","museum","mushroom","music","must","mutual","myself","mystery","myth","naive","name","napkin","narrow","nasty","nation","nature","near","neck","need","negative","neglect","neither","nephew","nerve","nest","net","network","neutral","never","news","next","nice","night","noble","noise","nominee","noodle","normal","north","nose","notable","note","nothing","notice","novel","now","nuclear","number","nurse","nut","oak","obey","object","oblige","obscure","observe","obtain","obvious","occur","ocean","october","odor","off","offer","office","often","oil","okay","old","olive","olympic","omit","once","one","onion","online","only","open","opera","opinion","oppose","option","orange","orbit","orchard","order","ordinary","organ","orient","original","orphan","ostrich","other","outdoor","outer","output","outside","oval","oven","over","own","owner","oxygen","oyster","ozone","pact","paddle","page","pair","palace","palm","panda","panel","panic","panther","paper","parade","parent","park","parrot","party","pass","patch","path","patient","patrol","pattern","pause","pave","payment","peace","peanut","pear","peasant","pelican","pen","penalty","pencil","people","pepper","perfect","permit","person","pet","phone","photo","phrase","physical","piano","picnic","picture","piece","pig","pigeon","pill","pilot","pink","pioneer","pipe","pistol","pitch","pizza","place","planet","plastic","plate","play","please","pledge","pluck","plug","plunge","poem","poet","point","polar","pole","police","pond","pony","pool","popular","portion","position","possible","post","potato","pottery","poverty","powder","power","practice","praise","predict","prefer","prepare","present","pretty","prevent","price","pride","primary","print","priority","prison","private","prize","problem","process","produce","profit","program","project","promote","proof","property","prosper","protect","proud","provide","public","pudding","pull","pulp","pulse","pumpkin","punch","pupil","puppy","purchase","purity","purpose","purse","push","put","puzzle","pyramid","quality","quantum","quarter","question","quick","quit","quiz","quote","rabbit","raccoon","race","rack","radar","radio","rail","rain","raise","rally","ramp","ranch","random","range","rapid","rare","rate","rather","raven","raw","razor","ready","real","reason","rebel","rebuild","recall","receive","recipe","record","recycle","reduce","reflect","reform","refuse","region","regret","regular","reject","relax","release","relief","rely","remain","remember","remind","remove","render","renew","rent","reopen","repair","repeat","replace","report","require","rescue","resemble","resist","resource","response","result","retire","retreat","return","reunion","reveal","review","reward","rhythm","rib","ribbon","rice","rich","ride","ridge","rifle","right","rigid","ring","riot","ripple","risk","ritual","rival","river","road","roast","robot","robust","rocket","romance","roof","rookie","room","rose","rotate","rough","round","route","royal","rubber","rude","rug","rule","run","runway","rural","sad","saddle","sadness","safe","sail","salad","salmon","salon","salt","salute","same","sample","sand","satisfy","satoshi","sauce","sausage","save","say","scale","scan","scare","scatter","scene","scheme","school","science","scissors","scorpion","scout","scrap","screen","script","scrub","sea","search","season","seat","second","secret","section","security","seed","seek","segment","select","sell","seminar","senior","sense","sentence","series","service","session","settle","setup","seven","shadow","shaft","shallow","share","shed","shell","sheriff","shield","shift","shine","ship","shiver","shock","shoe","shoot","shop","short","shoulder","shove","shrimp","shrug","shuffle","shy","sibling","sick","side","siege","sight","sign","silent","silk","silly","silver","similar","simple","since","sing","siren","sister","situate","six","size","skate","sketch","ski","skill","skin","skirt","skull","slab","slam","sleep","slender","slice","slide","slight","slim","slogan","slot","slow","slush","small","smart","smile","smoke","smooth","snack","snake","snap","sniff","snow","soap","soccer","social","sock","soda","soft","solar","soldier","solid","solution","solve","someone","song","soon","sorry","sort","soul","sound","soup","source","south","space","spare","spatial","spawn","speak","special","speed","spell","spend","sphere","spice","spider","spike","spin","spirit","split","spoil","sponsor","spoon","sport","spot","spray","spread","spring","spy","square","squeeze","squirrel","stable","stadium","staff","stage","stairs","stamp","stand","start","state","stay","steak","steel","stem","step","stereo","stick","still","sting","stock","stomach","stone","stool","story","stove","strategy","street","strike","strong","struggle","student","stuff","stumble","style","subject","submit","subway","success","such","sudden","suffer","sugar","suggest","suit","summer","sun","sunny","sunset","super","supply","supreme","sure","surface","surge","surprise","surround","survey","suspect","sustain","swallow","swamp","swap","swarm","swear","sweet","swift","swim","swing","switch","sword","symbol","symptom","syrup","system","table","tackle","tag","tail","talent","talk","tank","tape","target","task","taste","tattoo","taxi","teach","team","tell","ten","tenant","tennis","tent","term","test","text","thank","that","theme","then","theory","there","they","thing","this","thought","three","thrive","throw","thumb","thunder","ticket","tide","tiger","tilt","timber","time","tiny","tip","tired","tissue","title","toast","tobacco","today","toddler","toe","together","toilet","token","tomato","tomorrow","tone","tongue","tonight","tool","tooth","top","topic","topple","torch","tornado","tortoise","toss","total","tourist","toward","tower","town","toy","track","trade","traffic","tragic","train","transfer","trap","trash","travel","tray","treat","tree","trend","trial","tribe","trick","trigger","trim","trip","trophy","trouble","truck","true","truly","trumpet","trust","truth","try","tube","tuition","tumble","tuna","tunnel","turkey","turn","turtle","twelve","twenty","twice","twin","twist","two","type","typical","ugly","umbrella","unable","unaware","uncle","uncover","under","undo","unfair","unfold","unhappy","uniform","unique","unit","universe","unknown","unlock","until","unusual","unveil","update","upgrade","uphold","upon","upper","upset","urban","urge","usage","use","used","useful","useless","usual","utility","vacant","vacuum","vague","valid","valley","valve","van","vanish","vapor","various","vast","vault","vehicle","velvet","vendor","venture","venue","verb","verify","version","very","vessel","veteran","viable","vibrant","vicious","victory","video","view","village","vintage","violin","virtual","virus","visa","visit","visual","vital","vivid","vocal","voice","void","volcano","volume","vote","voyage","wage","wagon","wait","walk","wall","walnut","want","warfare","warm","warrior","wash","wasp","waste","water","wave","way","wealth","weapon","wear","weasel","weather","web","wedding","weekend","weird","welcome","west","wet","whale","what","wheat","wheel","when","where","whip","whisper","wide","width","wife","wild","will","win","window","wine","wing","wink","winner","winter","wire","wisdom","wise","wish","witness","wolf","woman","wonder","wood","wool","word","work","world","worry","worth","wrap","wreck","wrestle","wrist","write","wrong","yard","year","yellow","you","young","youth","zebra","zero","zone","zoo"
];

// Generate cryptographically secure passphrase with production-grade entropy
// Using 1296-word list with 7 words = 72.4 bits of entropy (exceeds 64-bit requirement)
function generateSecurePassphrase(): string {
  const wordCount = 7; // 7 words from 1296-word list = 72.4 bits
  const words: string[] = [];
  
  // Use crypto.getRandomValues for cryptographically secure randomness
  const randomValues = new Uint32Array(wordCount);
  window.crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < wordCount; i++) {
    const randomIndex = randomValues[i] % SECURE_WORDLIST.length;
    words.push(SECURE_WORDLIST[randomIndex]);
  }
  
  return words.join("-");
}

// Secret Type Registry - centralizes metadata for all integration types
// IMPORTANT: Must match database schema (snake_case)
type IntegrationType = "smtp" | "azure_blob" | "sftp" | "ftp" | "database" | "api_key" | "rabbitmq" | "kafka" | "oauth2" | "jwt" | "cookie" | "custom";

const smtpSchema = z.object({
  label: z.string().min(1, "Label is required"),
  host: z.string().optional(),
  username: z.string().optional(),
  description: z.string().optional(),
  password: z.string().min(1, "Password is required"),
});

const azureBlobSchema = z.object({
  label: z.string().min(1, "Label is required"),
  accountName: z.string().min(1, "Account name is required"),
  accountKey: z.string().min(1, "Account key is required"),
  sasUrl: z.string().optional(),
  description: z.string().optional(),
});

const sftpSchema = z.object({
  label: z.string().min(1, "Label is required"),
  host: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  privateKey: z.string().optional(),
  passphrase: z.string().optional(),
  description: z.string().optional(),
}).refine((data) => data.password || data.privateKey, {
  message: "Either password or private key is required",
  path: ["password"],
});

const ftpSchema = z.object({
  label: z.string().min(1, "Label is required"),
  host: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  privateKey: z.string().optional(),
  passphrase: z.string().optional(),
  description: z.string().optional(),
}).refine((data) => data.password || data.privateKey, {
  message: "Either password or private key is required",
  path: ["password"],
});

const databaseSchema = z.object({
  label: z.string().min(1, "Label is required"),
  host: z.string().optional(),
  connectionString: z.string().optional(),
  password: z.string().optional(),
  description: z.string().optional(),
}).refine((data) => data.connectionString || data.password, {
  message: "Either connection string or password is required",
  path: ["connectionString"],
});

const apiKeySchema = z.object({
  label: z.string().min(1, "Label is required"),
  serviceName: z.string().optional(),
  apiKey: z.string().min(1, "API key is required"),
  apiSecret: z.string().optional(),
  description: z.string().optional(),
});

const rabbitmqSchema = z.object({
  label: z.string().min(1, "Label is required"),
  connectionUrl: z.string().min(1, "Connection URL is required (e.g., amqp://user:pass@host:5672)"),
  username: z.string().optional(),
  password: z.string().optional(),
  description: z.string().optional(),
});

const kafkaSchema = z.object({
  label: z.string().min(1, "Label is required"),
  brokers: z.string().min(1, "Broker URLs are required (comma-separated)"),
  username: z.string().optional(),
  password: z.string().optional(),
  saslMechanism: z.string().optional(),
  description: z.string().optional(),
});

const customSchema = z.object({
  label: z.string().min(1, "Label is required"),
  description: z.string().optional(),
  secretData: z.string().min(1, "Secret data is required"),
});

const oauth2Schema = z.object({
  label: z.string().min(1, "Label is required"),
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client secret is required"),
  tokenUrl: z.string().url("Token URL must be a valid URL"),
  authorizationUrl: z.string().url("Authorization URL must be a valid URL").optional(),
  scope: z.string().optional(),
  redirectUri: z.string().url("Redirect URI must be a valid URL").optional(),
  audience: z.string().optional(),
  description: z.string().optional(),
});

const jwtSchema = z.object({
  label: z.string().min(1, "Label is required"),
  algorithm: z.enum(["HS256", "HS512", "RS256", "RS512"], {
    errorMap: () => ({ message: "Algorithm must be HS256, HS512, RS256, or RS512" }),
  }),
  secret: z.string().optional(),
  privateKey: z.string().optional(),
  publicKey: z.string().optional(),
  issuer: z.string().optional(),
  audience: z.string().optional(),
  keyId: z.string().optional(),
  description: z.string().optional(),
}).refine(
  (data) => {
    if (data.algorithm.startsWith('HS')) {
      return !!data.secret;
    }
    if (data.algorithm.startsWith('RS')) {
      return !!data.privateKey;
    }
    return false;
  },
  (data) => ({
    message: data.algorithm.startsWith('HS')
      ? "HS algorithms require 'secret' field"
      : "RS algorithms require 'privateKey' field",
    path: data.algorithm.startsWith('HS') ? ['secret'] : ['privateKey'],
  })
);

const cookieSchema = z.object({
  label: z.string().min(1, "Label is required"),
  cookieName: z.string().min(1, "Cookie name is required"),
  cookieSecret: z.string().min(1, "Cookie secret is required"),
  sessionSecret: z.string().optional(),
  domain: z.string().optional(),
  path: z.string().default("/"),
  secure: z.boolean().optional(),
  httpOnly: z.boolean().optional(),
  sameSite: z.enum(["strict", "lax", "none"]).optional(),
  description: z.string().optional(),
});

interface SecretTypeConfig {
  icon: any;
  label: string;
  description: string;
  schema: z.ZodSchema;
  sensitiveFields: string[];
}

const secretTypeConfig: Record<IntegrationType, SecretTypeConfig> = {
  smtp: {
    icon: Mail,
    label: "SMTP Email",
    description: "Email server credentials",
    schema: smtpSchema,
    sensitiveFields: ["password"],
  },
  azure_blob: {
    icon: Cloud,
    label: "Azure Blob Storage",
    description: "Azure storage account keys",
    schema: azureBlobSchema,
    sensitiveFields: ["accountKey", "sasUrl"],
  },
  sftp: {
    icon: Server,
    label: "SFTP",
    description: "Secure file transfer protocol",
    schema: sftpSchema,
    sensitiveFields: ["password", "privateKey", "passphrase"],
  },
  ftp: {
    icon: HardDrive,
    label: "FTP",
    description: "File transfer protocol",
    schema: ftpSchema,
    sensitiveFields: ["password", "privateKey", "passphrase"],
  },
  database: {
    icon: Database,
    label: "Database",
    description: "Database connection credentials",
    schema: databaseSchema,
    sensitiveFields: ["connectionString", "password"],
  },
  api_key: {
    icon: Key,
    label: "API Key",
    description: "Third-party API keys",
    schema: apiKeySchema,
    sensitiveFields: ["apiKey", "apiSecret"],
  },
  rabbitmq: {
    icon: Server,
    label: "RabbitMQ",
    description: "Message queue credentials",
    schema: rabbitmqSchema,
    sensitiveFields: ["connectionUrl", "password"],
  },
  kafka: {
    icon: Database,
    label: "Kafka",
    description: "Streaming platform credentials",
    schema: kafkaSchema,
    sensitiveFields: ["brokers", "password"],
  },
  oauth2: {
    icon: LockIcon,
    label: "OAuth2",
    description: "OAuth2 authentication credentials",
    schema: oauth2Schema,
    sensitiveFields: ["clientSecret"],
  },
  jwt: {
    icon: FileKey,
    label: "JWT",
    description: "JSON Web Token signing credentials",
    schema: jwtSchema,
    sensitiveFields: ["secret", "privateKey"],
  },
  cookie: {
    icon: Cookie,
    label: "Cookie",
    description: "Cookie-based authentication",
    schema: cookieSchema,
    sensitiveFields: ["cookieSecret", "sessionSecret"],
  },
  custom: {
    icon: Box,
    label: "Custom Secret",
    description: "Custom encrypted data",
    schema: customSchema,
    sensitiveFields: ["secretData"],
  },
};

export default function SecretsVault() {
  const { toast } = useToast();
  const [masterSeed, setMasterSeed] = useState("");
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [showResetDialog, setShowResetDialog] = useState(false);

  // Check vault status
  const { data: vaultStatus } = useQuery<{
    initialized: boolean;
    unlocked: boolean;
  }>({
    queryKey: ["/api/secrets/status"],
  });

  // Initialize vault
  const initMutation = useMutation({
    mutationFn: async (seed: string) => {
      const res = await apiRequest("POST", "/api/secrets/initialize", { masterSeed: seed });
      return await res.json();
    },
    onSuccess: (data: any) => {
      setRecoveryCode(data.recoveryCode);
      setShowRecoveryCode(true);
      queryClient.invalidateQueries({ queryKey: ["/api/secrets/status"] });
      toast({
        title: "Vault Initialized",
        description: "Your secrets vault has been created. Save your recovery code!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Initialization Failed",
        description: error.message || "Failed to initialize vault",
        variant: "destructive",
      });
    },
  });

  // Unlock vault
  const unlockMutation = useMutation({
    mutationFn: async (seed: string) => {
      const res = await apiRequest("POST", "/api/secrets/unlock", { masterSeed: seed });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secrets/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
      setMasterSeed("");
      setFailedAttempts(0); // Reset counter on success
      toast({
        title: "Vault Unlocked",
        description: "You can now manage your secrets",
      });
    },
    onError: (error: any) => {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      
      if (newAttempts >= 5) {
        toast({
          title: "Multiple Failed Attempts",
          description: "You've failed to unlock 5 times. Consider resetting the vault if you've lost your master seed.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Unlock Failed",
          description: `${error.message || "Invalid master seed"} (Attempt ${newAttempts}/5)`,
          variant: "destructive",
        });
      }
    },
  });

  // Reset vault (destroys all secrets)
  const resetVaultMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/secrets/reset", { 
        confirmation: "DELETE_ALL_SECRETS" 
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secrets/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
      setMasterSeed("");
      setFailedAttempts(0);
      setShowResetDialog(false);
      toast({
        title: "Vault Reset Complete",
        description: "All secrets have been deleted. You can now initialize a new vault.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset vault",
        variant: "destructive",
      });
    },
  });

  // Lock vault
  const lockMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/secrets/lock");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secrets/status"] });
      toast({
        title: "Vault Locked",
        description: "Your secrets are secured",
      });
    },
  });

  // Vault not initialized - show onboarding
  if (vaultStatus && !vaultStatus.initialized) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Lock className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Initialize Secrets Vault</CardTitle>
                <CardDescription>
                  Create a master seed to encrypt all integration credentials
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <AlertTitle className="text-amber-600 dark:text-amber-400">Important Security Notice</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                <ul className="list-disc list-inside space-y-1 mt-2">
                  <li>Your master seed is <strong>NEVER stored</strong> on our servers</li>
                  <li>Loss of your master seed means <strong>PERMANENT DATA LOSS</strong></li>
                  <li>You will receive a recovery code - <strong>save it securely</strong></li>
                  <li>We cannot recover your secrets if you lose both</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="master-seed">Master Seed (Passphrase)</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="master-seed"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter a strong passphrase (min 12 characters)"
                    value={masterSeed}
                    onChange={(e) => setMasterSeed(e.target.value)}
                    data-testid="input-master-seed"
                    className="pr-20"
                  />
                  <div className="absolute right-0 top-0 h-full flex items-center gap-1 pr-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowPassword(!showPassword)}
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    {masterSeed && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          navigator.clipboard.writeText(masterSeed);
                          toast({
                            title: "Copied to Clipboard",
                            description: "Passphrase has been copied. Clear your clipboard after saving it securely.",
                          });
                        }}
                        data-testid="button-copy-passphrase"
                      >
                        <Shield className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const passphrase = generateSecurePassphrase();
                    setMasterSeed(passphrase);
                    setShowPassword(true); // Auto-show when generated
                    toast({
                      title: "Passphrase Generated",
                      description: "A secure passphrase has been generated. Make sure to save it!",
                    });
                  }}
                  data-testid="button-generate-passphrase"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate
                </Button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <p className="text-muted-foreground">
                  Use a long, memorable passphrase. This encrypts all your secrets.
                </p>
                <a
                  href="https://www.useapassphrase.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 whitespace-nowrap"
                  data-testid="link-password-generator"
                >
                  Password Generator <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            <Button
              onClick={() => initMutation.mutate(masterSeed)}
              disabled={masterSeed.length < 12 || initMutation.isPending}
              className="w-full"
              data-testid="button-initialize-vault"
            >
              {initMutation.isPending ? "Initializing..." : "Initialize Vault"}
            </Button>
          </CardContent>
        </Card>

        {/* Recovery Code Dialog */}
        <Dialog open={showRecoveryCode} onOpenChange={setShowRecoveryCode}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-green-500" />
                Save Your Recovery Code
              </DialogTitle>
              <DialogDescription>
                Store this code in a secure location. You'll need it if you forget your master seed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Alert className="border-green-500/50 bg-green-500/10">
                  <AlertDescription className="font-mono text-center text-lg py-2">
                    {recoveryCode}
                  </AlertDescription>
                </Alert>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    navigator.clipboard.writeText(recoveryCode);
                    toast({
                      title: "Recovery Code Copied",
                      description: "Make sure to save it in a secure location offline.",
                    });
                  }}
                  data-testid="button-copy-recovery-code"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  Copy Recovery Code
                </Button>
              </div>
              <Alert className="border-red-500/50 bg-red-500/10">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <AlertTitle className="text-red-600 dark:text-red-400">Warning</AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-300">
                  This code is shown only once. Write it down and store it securely offline.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button onClick={() => {
                setShowRecoveryCode(false);
                setRecoveryCode("");
              }} data-testid="button-recovery-confirm">
                I've Saved My Recovery Code
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Vault initialized but locked - show unlock
  if (vaultStatus && vaultStatus.initialized && !vaultStatus.unlocked) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/10 rounded-lg">
                <Lock className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <CardTitle>Vault Locked</CardTitle>
                <CardDescription>
                  Enter your master seed to access secrets
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unlock-seed">Master Seed</Label>
              <Input
                id="unlock-seed"
                type="password"
                placeholder="Enter your master seed"
                value={masterSeed}
                onChange={(e) => setMasterSeed(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && masterSeed.length >= 12) {
                    unlockMutation.mutate(masterSeed);
                  }
                }}
                data-testid="input-unlock-seed"
              />
              <p className="text-xs text-muted-foreground">
                Enter the passphrase you created during initialization
              </p>
            </div>

            <Button
              onClick={() => unlockMutation.mutate(masterSeed)}
              disabled={masterSeed.length < 12 || unlockMutation.isPending}
              className="w-full"
              data-testid="button-unlock-vault"
            >
              {unlockMutation.isPending ? "Unlocking..." : "Unlock Vault"}
            </Button>

            {failedAttempts >= 5 && (
              <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Too Many Failed Attempts</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p className="text-sm">
                    You've failed to unlock the vault {failedAttempts} times. If you've lost your master seed, 
                    you can reset the vault to start over.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowResetDialog(true)}
                    data-testid="button-show-reset"
                  >
                    Reset Vault
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-red-500/10 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <AlertDialogTitle>Reset Secrets Vault</AlertDialogTitle>
              </div>
              <AlertDialogDescription className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  This action will permanently delete all stored secrets and reset the vault to its initial state.
                </div>
                
                <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-sm">⚠️ PERMANENT DATA LOSS</AlertTitle>
                  <AlertDescription className="space-y-2 text-xs">
                    <p><strong>All the following will be PERMANENTLY DELETED:</strong></p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>All SMTP email credentials</li>
                      <li>All Azure Blob storage keys</li>
                      <li>All SFTP/FTP credentials</li>
                      <li>All database connection strings</li>
                      <li>All API keys and custom secrets</li>
                      <li>Your master seed hash and recovery code</li>
                    </ul>
                    <p className="mt-2 font-bold">This action CANNOT be undone. There is NO recovery.</p>
                  </AlertDescription>
                </Alert>

                <div className="text-sm text-muted-foreground">
                  After reset, you will need to:
                  <ol className="list-decimal list-inside mt-2 space-y-1 ml-2">
                    <li>Create a new master seed</li>
                    <li>Re-enter all your integration credentials</li>
                    <li>Reconfigure any services using these secrets</li>
                  </ol>
                </div>

                <div className="text-sm font-semibold text-muted-foreground">
                  Are you absolutely sure you want to proceed?
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-reset">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => resetVaultMutation.mutate()}
                disabled={resetVaultMutation.isPending}
                data-testid="button-confirm-reset"
                className="bg-red-500 hover:bg-red-600"
              >
                {resetVaultMutation.isPending ? "Resetting..." : "Yes, Delete All Secrets"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Vault unlocked - show secrets management
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-500/10 rounded-lg">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <CardTitle>Vault Unlocked</CardTitle>
                <CardDescription>
                  Manage your integration secrets securely
                </CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => lockMutation.mutate()}
              data-testid="button-lock-vault"
            >
              <Lock className="h-4 w-4 mr-2" />
              Lock Vault
            </Button>
          </div>
        </CardHeader>
      </Card>

      <SecretsManagement />
    </div>
  );
}

// Add Secret Dialog - Two-step flow: type selection → dynamic form
function AddSecretDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<IntegrationType | null>(null);
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});

  const createSecretMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/secrets", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
      toast({
        title: "Secret Added",
        description: "Your secret has been securely stored",
      });
      onOpenChange(false);
      setStep(1);
      setSelectedType(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Secret",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const config = selectedType ? secretTypeConfig[selectedType] : null;
  const form = useForm<any>({
    resolver: config ? zodResolver(config.schema) : undefined,
    defaultValues: {
      label: "",
      host: "",
      username: "",
      password: "",
      accountName: "",
      accountKey: "",
      sasUrl: "",
      privateKey: "",
      passphrase: "",
      connectionString: "",
      serviceName: "",
      apiKey: "",
      apiSecret: "",
      secretData: "",
      description: "",
      // OAuth2 fields
      clientId: "",
      clientSecret: "",
      tokenUrl: "",
      authorizationUrl: "",
      scope: "",
      redirectUri: "",
      audience: "",
      // JWT fields
      algorithm: "HS256",
      secret: "",
      publicKey: "",
      issuer: "",
      keyId: "",
      // Cookie fields
      cookieName: "",
      cookieSecret: "",
      sessionSecret: "",
      domain: "",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      // RabbitMQ/Kafka fields
      connectionUrl: "",
      brokers: "",
      saslMechanism: "",
    },
  });

  const onSubmit = (data: any) => {
    if (!selectedType) return;

    // Transform flat form data into nested payload structure
    const { label, description, ...rest } = data;
    const metadata: any = { description };
    const payload: any = {};

    // Extract metadata and payload based on type
    Object.keys(rest).forEach((key) => {
      if (config?.sensitiveFields.includes(key)) {
        payload[key] = rest[key];
      } else if (key !== "secretData") {
        if (rest[key]) metadata[key] = rest[key];
      }
    });

    // Special handling for Custom type
    if (selectedType === "custom" && data.secretData) {
      try {
        payload.data = JSON.parse(data.secretData);
      } catch {
        payload.data = { value: data.secretData };
      }
    }

    createSecretMutation.mutate({
      label,
      integrationType: selectedType,
      metadata,
      payload,
    });
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep(1);
      setSelectedType(null);
      form.reset();
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Select Secret Type" : `Add ${config?.label}`}
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? "Choose the type of integration secret you want to store"
              : config?.description}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(secretTypeConfig) as IntegrationType[]).map((type) => {
              const cfg = secretTypeConfig[type];
              const Icon = cfg.icon;
              return (
                <Card
                  key={type}
                  className="cursor-pointer hover-elevate active-elevate-2"
                  onClick={() => {
                    setSelectedType(type);
                    setStep(2);
                  }}
                  data-testid={`card-secret-type-${type.toLowerCase()}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{cfg.label}</h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {cfg.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Label</FormLabel>
                    <FormControl>
                      <Input placeholder="My Production SMTP" {...field} data-testid="input-secret-label" />
                    </FormControl>
                    <FormDescription>A friendly name for this secret</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Type-specific fields */}
              {selectedType === "smtp" && (
                <>
                  <FormField control={form.control} name="host" render={({ field }) => (
                    <FormItem>
                      <FormLabel>SMTP Host (optional)</FormLabel>
                      <FormControl><Input placeholder="smtp.gmail.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="username" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username (optional)</FormLabel>
                      <FormControl><Input placeholder="user@example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.password ? "text" : "password"} placeholder="••••••••" {...field} data-testid="input-password" />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, password: !showFields.password })}>
                            {showFields.password ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              {selectedType === "azure_blob" && (
                <>
                  <FormField control={form.control} name="accountName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Name</FormLabel>
                      <FormControl><Input placeholder="mystorageaccount" {...field} data-testid="input-account-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="accountKey" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Key</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.accountKey ? "text" : "password"} placeholder="••••••••" {...field} data-testid="input-account-key" />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, accountKey: !showFields.accountKey })}>
                            {showFields.accountKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="sasUrl" render={({ field }) => (
                    <FormItem>
                      <FormLabel>SAS URL (optional)</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.sasUrl ? "text" : "password"} placeholder="https://..." {...field} />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, sasUrl: !showFields.sasUrl })}>
                            {showFields.sasUrl ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              {(selectedType === "sftp" || selectedType === "ftp") && (
                <>
                  <FormField control={form.control} name="host" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Host (optional)</FormLabel>
                      <FormControl><Input placeholder="ftp.example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="username" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username (optional)</FormLabel>
                      <FormControl><Input placeholder="ftpuser" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password (optional)</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.password ? "text" : "password"} placeholder="••••••••" {...field} />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, password: !showFields.password })}>
                            {showFields.password ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="privateKey" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Private Key (optional)</FormLabel>
                      <FormControl>
                        <div className="flex gap-2 flex-col">
                          <Textarea placeholder="-----BEGIN RSA PRIVATE KEY-----" {...field} className="font-mono text-xs" rows={4} />
                          <Button type="button" variant="outline" size="sm" onClick={() => setShowFields({ ...showFields, privateKey: !showFields.privateKey })}>
                            {showFields.privateKey ? <><EyeOff className="h-4 w-4 mr-2" /> Hide</> : <><Eye className="h-4 w-4 mr-2" /> Show</>}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              {selectedType === "database" && (
                <>
                  <FormField control={form.control} name="host" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Host (optional)</FormLabel>
                      <FormControl><Input placeholder="db.example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="connectionString" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Connection String (optional)</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.connectionString ? "text" : "password"} placeholder="postgresql://..." {...field} />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, connectionString: !showFields.connectionString })}>
                            {showFields.connectionString ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password (optional)</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.password ? "text" : "password"} placeholder="••••••••" {...field} />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, password: !showFields.password })}>
                            {showFields.password ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              {selectedType === "api_key" && (
                <>
                  <FormField control={form.control} name="serviceName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Name (optional)</FormLabel>
                      <FormControl><Input placeholder="OpenAI, Stripe, etc." {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="apiKey" render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Key</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.apiKey ? "text" : "password"} placeholder="sk_..." {...field} data-testid="input-api-key" />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, apiKey: !showFields.apiKey })}>
                            {showFields.apiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="apiSecret" render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Secret (optional)</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.apiSecret ? "text" : "password"} placeholder="••••••••" {...field} />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, apiSecret: !showFields.apiSecret })}>
                            {showFields.apiSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              {selectedType === "rabbitmq" && (
                <>
                  <FormField control={form.control} name="connectionUrl" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Connection URL</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.connectionUrl ? "text" : "password"} placeholder="amqp://user:pass@host:5672" {...field} data-testid="input-connection-url" />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, connectionUrl: !showFields.connectionUrl })}>
                            {showFields.connectionUrl ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="username" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username (optional)</FormLabel>
                      <FormControl><Input placeholder="admin" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password (optional)</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.password ? "text" : "password"} placeholder="••••••••" {...field} />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, password: !showFields.password })}>
                            {showFields.password ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              {selectedType === "kafka" && (
                <>
                  <FormField control={form.control} name="brokers" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Broker URLs</FormLabel>
                      <FormControl><Input placeholder="broker1:9092,broker2:9092" {...field} data-testid="input-brokers" /></FormControl>
                      <FormDescription>Comma-separated list of Kafka brokers</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="username" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username (optional)</FormLabel>
                      <FormControl><Input placeholder="kafka-user" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password (optional)</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.password ? "text" : "password"} placeholder="••••••••" {...field} />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, password: !showFields.password })}>
                            {showFields.password ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="saslMechanism" render={({ field }) => (
                    <FormItem>
                      <FormLabel>SASL Mechanism (optional)</FormLabel>
                      <FormControl><Input placeholder="PLAIN, SCRAM-SHA-256" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              {selectedType === "oauth2" && (
                <>
                  <FormField control={form.control} name="clientId" render={({ field}) => (
                    <FormItem>
                      <FormLabel>Client ID</FormLabel>
                      <FormControl><Input placeholder="your-client-id" {...field} data-testid="input-client-id" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="clientSecret" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Secret</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.clientSecret ? "text" : "password"} placeholder="••••••••" {...field} data-testid="input-client-secret" />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, clientSecret: !showFields.clientSecret })}>
                            {showFields.clientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="tokenUrl" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Token URL</FormLabel>
                      <FormControl><Input type="url" placeholder="https://auth.example.com/oauth/token" {...field} data-testid="input-token-url" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="authorizationUrl" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authorization URL (optional)</FormLabel>
                      <FormControl><Input type="url" placeholder="https://auth.example.com/oauth/authorize" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="scope" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Scope (optional)</FormLabel>
                      <FormControl><Input placeholder="read write" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="redirectUri" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Redirect URI (optional)</FormLabel>
                      <FormControl><Input type="url" placeholder="https://yourapp.com/callback" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="audience" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Audience (optional)</FormLabel>
                      <FormControl><Input placeholder="https://api.example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              {selectedType === "jwt" && (
                <>
                  <FormField control={form.control} name="algorithm" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Algorithm</FormLabel>
                      <FormControl>
                        <select {...field} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" data-testid="select-algorithm">
                          <option value="HS256">HS256 (HMAC SHA-256)</option>
                          <option value="HS512">HS512 (HMAC SHA-512)</option>
                          <option value="RS256">RS256 (RSA SHA-256)</option>
                          <option value="RS512">RS512 (RSA SHA-512)</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="secret" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Secret (for HS algorithms)</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.secret ? "text" : "password"} placeholder="your-secret-key" {...field} data-testid="input-jwt-secret" />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, secret: !showFields.secret })}>
                            {showFields.secret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormDescription>Required for HS256/HS512</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="privateKey" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Private Key (for RS algorithms)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="-----BEGIN RSA PRIVATE KEY-----" {...field} className="font-mono text-xs" rows={6} data-testid="input-private-key" />
                      </FormControl>
                      <FormDescription>Required for RS256/RS512</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="publicKey" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Public Key (optional)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="-----BEGIN PUBLIC KEY-----" {...field} className="font-mono text-xs" rows={4} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="issuer" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issuer (optional)</FormLabel>
                      <FormControl><Input placeholder="https://yourapp.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="audience" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Audience (optional)</FormLabel>
                      <FormControl><Input placeholder="https://api.example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="keyId" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Key ID (optional)</FormLabel>
                      <FormControl><Input placeholder="key-2024-01" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              {selectedType === "cookie" && (
                <>
                  <FormField control={form.control} name="cookieName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cookie Name</FormLabel>
                      <FormControl><Input placeholder="session_id" {...field} data-testid="input-cookie-name" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="cookieSecret" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cookie Secret</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.cookieSecret ? "text" : "password"} placeholder="••••••••" {...field} data-testid="input-cookie-secret" />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, cookieSecret: !showFields.cookieSecret })}>
                            {showFields.cookieSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="sessionSecret" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Session Secret (optional)</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input type={showFields.sessionSecret ? "text" : "password"} placeholder="••••••••" {...field} />
                          <Button type="button" variant="outline" size="icon" onClick={() => setShowFields({ ...showFields, sessionSecret: !showFields.sessionSecret })}>
                            {showFields.sessionSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="domain" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Domain (optional)</FormLabel>
                      <FormControl><Input placeholder=".example.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="path" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Path</FormLabel>
                      <FormControl><Input placeholder="/" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              {selectedType === "custom" && (
                <FormField control={form.control} name="secretData" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secret Data</FormLabel>
                    <FormControl>
                      <Textarea placeholder='{"key": "value"}' {...field} className="font-mono text-xs" rows={6} data-testid="input-secret-data" />
                    </FormControl>
                    <FormDescription>JSON or plain text</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl><Input placeholder="Production environment credentials" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="submit" disabled={createSecretMutation.isPending} data-testid="button-save-secret">
                  {createSecretMutation.isPending ? "Saving..." : "Save Secret"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SecretsManagement() {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: secrets, isLoading } = useQuery({
    queryKey: ["/api/secrets"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Loading secrets...</div>
        </CardContent>
      </Card>
    );
  }

  const secretsList = Array.isArray(secrets) ? secrets : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Stored Secrets</h3>
          <p className="text-sm text-muted-foreground">
            {secretsList.length} secret{secretsList.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-secret">
          <Plus className="h-4 w-4 mr-2" />
          Add Secret
        </Button>
      </div>

      <AddSecretDialog open={showAddDialog} onOpenChange={setShowAddDialog} />

      {secretsList.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-2">
              <KeyRound className="h-12 w-12 mx-auto text-muted-foreground" />
              <h3 className="font-semibold">No Secrets Yet</h3>
              <p className="text-sm text-muted-foreground">
                Add your first integration secret to get started
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {secretsList.map((secret: any) => (
            <Card key={secret.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">{secret.label}</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      <Badge variant="outline" className="text-xs">
                        {secret.integrationType}
                      </Badge>
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  {secret.metadata?.host && (
                    <div>Host: {secret.metadata.host}</div>
                  )}
                  {secret.metadata?.username && (
                    <div>User: {secret.metadata.username}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-2">
                    Updated: {new Date(secret.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
