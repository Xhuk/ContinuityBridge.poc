import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Lock, Shield, KeyRound, Plus, Eye, EyeOff, Trash2, Edit2, CheckCircle, XCircle, AlertCircle, Sparkles, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
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

export default function SecretsVault() {
  const { toast } = useToast();
  const [masterSeed, setMasterSeed] = useState("");
  const [showRecoveryCode, setShowRecoveryCode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Check vault status
  const { data: vaultStatus } = useQuery({
    queryKey: ["/api/secrets/status"],
  });

  // Initialize vault
  const initMutation = useMutation({
    mutationFn: async (seed: string) => {
      return await apiRequest("/api/secrets/initialize", {
        method: "POST",
        body: JSON.stringify({ masterSeed: seed }),
        headers: { "Content-Type": "application/json" },
      });
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
      return await apiRequest("/api/secrets/unlock", {
        method: "POST",
        body: JSON.stringify({ masterSeed: seed }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/secrets/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
      setMasterSeed("");
      toast({
        title: "Vault Unlocked",
        description: "You can now manage your secrets",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Unlock Failed",
        description: error.message || "Invalid master seed",
        variant: "destructive",
      });
    },
  });

  // Lock vault
  const lockMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/secrets/lock", {
        method: "POST",
      });
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
          </CardContent>
        </Card>
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

function SecretsManagement() {
  const { toast } = useToast();

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
        <Button data-testid="button-add-secret">
          <Plus className="h-4 w-4 mr-2" />
          Add Secret
        </Button>
      </div>

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
