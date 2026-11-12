import { execFileSync } from "node:child_process";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createWindowsLauncher,
  windowHelperSource,
} from "./window-launcher.js";
import { createWindowsIcon } from "./app-icon.js";
import {
  createWindowsShortcutSetup,
  createWindowsShortcutSetupLauncher,
} from "./windows-shortcuts.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const local = resolve(root, ".local");
const directory = resolve(local, "ODAK-Masaustu");
const archive = resolve(local, "ODAK-Masaustu.zip");
const { version } = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
const versionedArchive = resolve(local, `ODAK-Masaustu-${version}.zip`);

const guide = `ODAK - MASAUSTU GORUNUMU (${version})

MASAUSTU KISAYOLU

ZIP dosyasini kalici bir klasore cikarin. Mevcut kayitlarla devam etmek icin
dosyalari eski TAKIP.html ile ayni klasore koyun.
ODAK-Kisayol-Kur.cmd dosyasina cift tiklayin. Masaustune ve Baslat menusune
ODAK simgeli kisayollar eklenir. Sonra masaustundeki ODAK simgesinden acin.
Widget icin kucuk pencere isaretli ayri bir ODAK Widget kisayolu da olusur.

Gorev cubugu: ODAK kendi ODAK simgesiyle, Chrome'dan ayri bir dugme olarak
gorunur. ODAK acikken gorev cubugundaki ODAK simgesine sag tiklayip
"Gorev cubuguna sabitle"yi secin; sabitlenen simge ODAK'i yeniden acar.
Baslat menusundeki ODAK kisayolu da ayni dugmeyi kullanir.
Daha once ODAK yerine Chrome sabitlendiyse o simgeyi "Gorev cubugundan
kaldir" ile kaldirip ODAK'i yeniden sabitleyin. Kisayol kurulumunu bu
surumle bir kez yeniden calistirin.
Paket klasorunu tasirsaniz kisayol kurulumunu yeniden calistirin ve
ODAK'i yeniden sabitleyin.

Bu paket, Windows'ta kurulu Google Chrome'un uygulama modunu kullanır.
Sekme ve adres çubuğu görünmez; Windows'un başlık, küçültme, büyütme ve
kapatma düğmeleri kalır. Ana uygulama tam ekran değil, önerilen boyutta açılır;
görev çubuğu görünür.
Ana uygulama ve widget Türkçe belgeler olarak otomatik çeviriden hariç tutulur.
Ana pencere ekranın ortasında 1440x900 içerik alanıyla açılır (Windows ekran
ölçeğine göre). Bu ölçüde bütün ekranlar sıkışmadan, Takvim Güncel işler'in
yanında görünür. Ekran bu boyuta yetmiyorsa ana pencere büyütülmüş açılır.
Baslik cubuguna cift tiklayinca pencere 1440 genisligini korur; yalniz
yuksekligi ekrana sigacak kadar kisalir, Takvim yine yan tarafta kalir.
Sonra elle büyütmek veya boyutlandırmak serbesttir. Widget 380x420 açılır.
Ana pencere 960 pikselden fazla daraltılırsa sayfa sıkışmaz, yana kayar;
1280 pikselden dar pencerede Takvim Güncel işler'in altına iner. Widget
300x320 pikselden küçültülürse içerik kaydırılarak okunur.
Ek bir kurulum veya yönetici izni gerekmez.
Bu bir .exe uygulaması değildir; Chrome motoru ve mevcut Chrome profili
kullanılır. Ayrı bir tarayıcı profili oluşturulmaz ve güvenlik ayarları
değiştirilmez.

UST CUBUK SAATI

Tarihin altında yerel saat daha büyük saat:dakika olarak görünür; dakika
geçişinde ve pencereye dönünce güncellenir. Kayıtları veya açık formları değiştirmez.

LISTE DUZENI

Üst çubuk tüm sayfalarda sabittir; liste kaydırılırken arama ve düğmeler
görünür kalır. Başlık yanındaki hedef, not ve bekleme simgeleri başlığın ilk
satırında kalır; yer daralınca önce başlık metni alt satıra geçer.
Genel bakışta Bu haftanın hedefleri de Takip gerekenler gibi ← → düğmeleriyle
ikişer kart sayfalanır.

Bekleyen konular sütunları: Durum, Son takip, Sonraki takip, Bekleme.
Bekleme düğmesi süreyi gösterir (7 gün altı nötr, 7-29 gün kum, 30+ kil
tonu); tıklanınca beklemeye başlama tarihi takvimden düzeltilir.
Bekleyen konular listesinde işlem sütunu önce kalem, sonra + düğmesidir.
Takip ettim (✓) düğmesi Son takip tarihinin yanındadır; kapanmış konularda
orada takip geçmişi simgesi bulunur. Durum ve tarih düğmeleri günlük
işlerdeki gibi tek boydadır; Takip ettim düğmeleri aynı hizadadır. Not balonu, hedef balonu gibi fare
simgeden ayrılınca hemen kapanır.
Takip kartlarında Takip ettim ve Bağlı işler sayacı yan yanadır. Bağlı işler,
bekleyen konudaki günlük iş listesini açar; yeni iş eklenebilir, mevcut iş
bağlanabilir ve kaynak bağlantısı kaldırılabilir. Birden fazla günlük iş
bağlanabilir; hedefi, durumu, tarihi, notları ve günlüğü korunur. Bağlama ve
ayırma tek Geri al adımıdır. Temas işlerini tamamlamak konuyu kapatmaz.
Yeni/düzenleme formlarında Ek bilgiler kapalı başlar. Haftalık ve aylık
teslim tarihi üsttedir. Düzenlemede de Adetle takip et seçeneği vardır;
değişmemiş formu kaydetmek yeni kayıt/geçmiş oluşturmaz. Genel Yeni kayıt
başka listeye eklenirse o liste açılır; panel/takvim içindeki yeni adımlar
bulundukları bağlama döner. Mevcut hedefi bağla alanı aday yokken de görünür.

HATIRLATMALAR (1.4.0)

Notlar kartında not eklerken veya düzenlerken Hatırlat seçilip tarih ve saat
girilir. Üst çubuktaki zil, zamanı gelen hatırlatma sayısını gösterir; zile
tıklayınca Tamam, 1 saat ve Yarın 09:00 seçenekleri çıkar.
1 saat ertelemesi çeyrek saate yuvarlanır (18:53 -> 20:00); saat alanına
istenen her dakika yazılabilir.
Tarihin yanındaki < > düğmeleri ve yukarı/aşağı ok tuşları günü değiştirir.
Saat 24 saat biçimindedir: < > düğmeleri 15'er dakika (:00 :15 :30 :45)
ilerletir; imleç saatteyken ok tuşları 1 saat, dakikadayken 15 dakika değiştirir.
Zamanı gelmemiş hatırlatmalar sayılmaz; zilde sayısız gri bir nokta durur,
üzerine gelince yaklaşan sayısı ve sıradaki saat yazar. ODAK açıkken
zamanı gelen hatırlatma bir kez kısa uyarıyla bildirilir; ses veya Windows
bildirimi yoktur. Widget açıksa zamanı gelenler widget'ın en üstünde durur.
ODAK ve widget kapalıyken hatırlatma çalmaz; açılınca kaçırılanlar görünür.

Genel bakışın altındaki takip ve hedef alanları ikişer kart gösterir.
Yanlarındaki Notlar alanı bağımsız maddeler tutar; ekleme/düzenleme/silme
tek Geri al adımıdır. Not silme onay istemez; Geri al ile geri getirilebilir.
Enter kaydeder, Shift+Enter alt satır ekler.
Yedek yükleme, kayıt silme ve kaydetmeden kapatma onayları tarayıcı kartı
yerine uygulamanın kendi küçük penceresinde açılır. Vazgeç, çarpı, Escape
veya dışarı tıklama işlemi iptal eder; alttaki form ve taslak korunur.
Çalışma notu kartı, pencere büyüse de sol altta sabit kalır.
Çalışma alanını sıfırlama onayı Sıfırla düğmesine yakın küçük bir pencerede
açılır. Vazgeç, çarpı, Escape veya dışına tıklamak kayıtları değiştirmez.
Notlar JSON yedeğine dahildir; eski notsuz yedek mevcut notları korur.
Takip kartlarında konu metni üstteki boş alanı kullanır; durum ve tarih
alt bölüme yaklaşır. Panel yüksekliği artmadan daha fazla satır okunur.
Haftalık hedefin durum/teslim tarihi takip kartlarıyla aynı alt hizadadır.
Durum solda, tarih sağda tek satırda kalır; dar kartta durum düğmesi iki satır olabilir.
Genel bakış haftalık kartında aylık üst hedef simgesi gösterilmez; bağlantı
ve haftalık listedeki simge korunur. Kart başlığına tıklamak veya ayrıntıdan
dönmek alt çizgi bırakmaz; yeni klavye gezinmesinin odağı görünür kalır.
Bekleyen konu listesindeki + sabittir ve her zaman yeni günlük adım açar.
Bağlı işler konu ayrıntısından açılır; listede ayrı sayaç gösterilmez.

Ayarlar içindeki eski Listeler menüsü kaldırıldı; eski kayıt değerleri
ve yedek uyumluluğu korunur. Bekleme bilgisi penceresinde Enter kaydeder,
Shift+Enter alt satır ekler.

Takip kartlarında tarih, sonuç ve sonraki takip tarihi gösterilir.

Notu düzenle penceresinde Enter kaydeder, Shift+Enter alt satıra geçer.

Bekleme bilgisi, başlıktan sonraki bağlantı ve not simgeleriyle aynı
gruptadır. Küçük balon yalnız bekleme nedenini gösterir; simgeye tıklamak
bekleme düzenleyicisini açar. Hedefi taşı formundaki Taşıma notu alanı
açıklama ve örnekle isteğe bağlı bir not ister.

Hedefin bağlı kaydındaki Bağı kaldır, yalnız o ilişkiyi çözer; günlük iş
anlık işe döner, alt hedef kendi türünde kalır. Durum/tarih/not/günlük ve
kaynak bağlantısı korunur, tek Geri al ilişkiyi geri getirir.

Not önizlemesi doğrudan metni gösteren kompakt beyaz/yeşil balondur;
ayrı başlık ve iç çerçeve yoktur. Uzun not kaydırılabilir, tıklamak not
editörünü açar. Panel kapanınca bağlantı balonu tekrar kendiliğinden açılmaz.
Pencereden dönülen başlık altı çizili kalmaz; yeni klavye gezinmesi odağı gösterir. Formlarda
kalın dış odak halkası yerine ince kenarlık kullanılır.
İşlem sütunu düğme sayısına göre kompakt ve sola hizalıdır. Yeni günlük iş
oluşturma simgesi + işaretidir. Bekleyen konu panelinde Takip ettim,
Takip geçmişi başlığının yanındadır; altta Kaydı düzenle ve Kapat bulunur.

Güncel işlerde Çalışmaya başla düğmesinin solundaki iş günlüğü simgesi
o işin oturumlarını açar; kayıtlı günlük lila, boş günlük nötrdür.

Toplantı ve bekleyen konu satırı/başlığı ayrıntıyı sağda açar; sağ uçtaki
kalem ilk kayıt formunu açar. Takip ettim ve günlük iş oluştur ayrı kalır.
Panelden düzenleme veya takip açılınca panel altta kalır; dönüşte aynı konu
ve kaydırma korunur. Panel açıkken başka kayıt/menü/düğme ilk tıklamada
çalışır; boş alan kapatır. Fareyle açıp kapatılan satır yeşil kalmaz.
Bağlantı simgeleri hızlı, beyaz zeminli ve yeşil kenarlıklı balon kullanır.
Not simgesine tıklamak doğrudan Notu düzenle penceresini açar; yalnız not
kaydedilir, tek Geri al ile geri döner. Değişmiş taslağı kapatmak onay ister.

Genel bakıştaki kartların gövdesi ayrıntıyı açar. Takip ayrıntısı kimden
beklendiğini, son gelişmeyi, tarihleri ve geçmişi salt okunur gösterir.
Kaydı düzenle mevcut formu açar. Hedef gövdesi paneli üstten açar;
İlerleme/Bağlı işler düğmeleri ilgili bölüme gider. Tarih ve Takip ettim
kendi işlemlerini yapar. Enter/Space kart odağındayken ayrıntıyı açar.
Kart açmak veya metin seçmek kaydı değiştirmez.

Düzenlemede dönem yıl + hafta tarih aralığı / ay adıyla seçilir. Seçim
yapılmadan eski veya boş dönem değeri değiştirilmez. Günlük işin bağlı
hedef simgesi listede ve Genel bakışta başlık yanındadır.
Duraklatılmış işin sağ düğmesi amber daire içinde oynat simgesidir.
Oturum düzenlemede yalnız saat/dakika girilir; not/tarih düzeltmeleri
eski ham süreyi değiştirmez. Kart listesinde büyük yeşil odak çerçevesi yoktur.

Ortak listelerde sıra durum, öncelik ve teslim tarihidir; hedef ilerlemesi
bunlardan sonra gelir. Başlık altındaki bağlamlar görünür ayraçlarla ayrılır.
Genel bakışta hedefin tarihi ve hedef panelindeki açık bağlı işin tarihi
tıklanarak değiştirilebilir; tek Geri al ile geri döner. Takip kartları
listedeki renkleri kullanır ve bekleme/son takip bilgisini açık yazar.

Kayıt formunun metin alanında Enter kaydeder; Shift+Enter alt satıra geçer.
Notu olan kaydın başlığındaki not defteri simgesine gelmek veya odaklanmak
Notlar metnini gösterir; tıklamak Notu düzenle penceresini açar. Boş not
için simge gösterilmez.

Altı kayıt türünün formunda temel alanlar dengeli sütunlarda yer alır;
dar ekranda tek sütuna iner. İsteğe bağlı alanlar Ek bilgiler altındadır;
yalnız başlık zorunludur. Hedeflerde sayısal ölçüm kapalı başlar. Açınca
hedef değer ve birim boş, mevcut değer 0 gelir; bunlar isteğe bağlıdır.
Pozitif hedef varsa kendi ölçümü önceliklidir; yoksa bağlı adımların
ilerlemesi kullanılır. Başlık ve kaydetme çubuğu alanlar kayarken görünür. Mevcut kayıt düzenlenirken
temel alanlar kayıt türüne göre öne çıkar; diğerleri sonradan gelen açık Ek bilgiler altındadır; istersen kapatabilirsin.

Günlük, haftalık, aylık ve senelik ekranlar ortak liste düzenini kullanır.
Tamamlama kutusu sol başta, günlük işlerde oynat düğmesi en sağdadır.
Açık işlerin kutusu boştur; tik yalnız tamamlanmış kayıtta görünür.
İptal edilen kayıtta kutu çarpı gösterir; başlık üstü çizili ve soluktur.
İlerleme çubuğu ve yüzde yerine — görünür; eski ölçümler ayrıntıda korunur.
İptal edilen alt kayıt üst hedefin ilerleme hesabına katılmaz.
Toplantı dışındaki listelerin durum menüsünde tamamlama tekrarlanmaz; listede
tamamlanmış kayıtlar ve formdaki durum seçenekleri korunur.

Eski Kısmi tamamlandı artık seçilemez; mevcut kayıt Devam ediyor olarak
gösterilir ve bu filtreye dahildir. Görüntüleme, filtreleme ve yedek alma
özgün değeri değiştirmez; durum dışındaki doğrudan düzenlemelerde de korunur.
Bağlantısız toplantıda eski açık durumlar Açık, kapalı durumlar Kapandı görünür.
Ham değer açıkça durum seçilince güncellenir; Geri al özgün değeri getirir.

Senelik hedefte yıl/dönem yeterlidir. Teslim tarihi sütunu, Termin filtresi,
teslim sıralaması ve form alanı kullanılmaz; senelik hedef takvimde tarih
kaydı oluşturmaz. Aylık alt hedef ve günlük iş tarihleri değişmez. Eski
senelik tarihler kayıtlarda ve JSON yedeklerinde aynen korunur; yeni senelik
hedefler teslim tarihi olmadan oluşturulur.

Satırın sağındaki küçük simge düğmeleri ortak biçimdedir. Üzerlerine
gelince büyük harfle başlayan açıklama okunur; klavyeyle de kullanılabilirler.
Hedefte satır/başlık ayrıntı panelini; kalem kayıt formunu;
+, bir alt düzeyin yeni kayıt formunu açar:
haftalık -> günlük iş, aylık -> haftalık hedef, senelik -> aylık hedef.
Günlük işte iş günlüğü ve çalışma düğmeleri sağ uçtadır.
Klavye odağı satırı hafifçe renklendirir ve başlığın altını çizer; bütün
satırı çevreleyen çerçeve kullanılmaz. Kaydı satıra
veya başlığa tıklayarak aç; aynı işi tekrarlayan ayrı açma düğmesi yoktur.
Başlığın altında işlem düğmesi ve bağlı iş sayısı tekrarlanmaz.
Pencere veya yan panel dışındaki boş alana tıklamak onu kapatır;
içte açılan pencere önce kapanır. Kayıt formunda kaydedilmemiş değişiklik
varsa dışarı tıklama, Escape veya kapatma düğmeleri önce onay ister.

Günlük işlerde, haftalık/aylık hedeflerde ve Genel bakışta bağlı üst hedef,
başlık yanındaki küçük hedef
simgesinden açılır; üzerine gelince tam adı okunur. Bağlantı altta tekrarlanmaz.
Kaynak ve not simgeleri de aynı gruptadır; kaynak simgesi asıl kaydı açar,
not simgesi gerçek notu önizler.
Anlık iş, proje kodu ve iş türü etiketleri gösterilmez. Hedefin
üst hedef bağlantısı başlık yanındaki hedef simgesiyle açılır. Tüm haftalar/aylar/yıllar
görünümünde dönem 16-22 Kasım 2026 / Kasım 2026 / 2026 gibi okunur; seçili
dönem üstte yazıyorsa satırda tekrarlanmaz. Toplantıda karar ve varsa
toplantı tarihi gösterilir. Bölüm adı veya boş alt satır eklenmez.
Görüntüleme kayıtları değiştirmez.

Bütün hedefler aynı sağ paneli ve İlerleme > Bağlı işler/alt hedefler
sırasını kullanır; hedef satırı büyümez. Hedefi düzenle formu paneli kapatmadan
açılır; form kapanınca aynı hedef, kaydırma ve ilerleme taslağı korunur.
Panel açıkken sayfadaki başka bir hedefe tıklamak doğrudan o hedefi açar;
boş alana tıklamak paneli kapatır. Üst çubuktaki Geri al da panel açıkken
çalışır ve paneli günceller. Dönemler hafta
tarihleri, ay adı veya yıl olarak okunur.
Alt hedefe veya üst hedef bağlantısına tıklayarak panelde ilerleyebilirsin.
Haftalık hedefin günlük işleri düzenlenebilir, tamamlanabilir ve
başlatılabilir. Yeni adım / Yeni haftalık hedef / Yeni aylık hedef,
üst hedefi hazır seçili formu açar; vazgeçmek kayıt oluşturmaz.
Mevcut kaydı bağla seçimi yalnız doğru türdeki açık ve başka hedefe
bağlanmamış kayıtları sunar; anlık günlük işler dahil edilmez.

Bağlantılar isteğe bağlıdır: günlük iş haftalığa, haftalık aylığa,
aylık seneliğe bağlanabilir. Haftalık/aylık formundaki Bağlı üst hedef
alanı düzenlenebilir; mevcut kapalı bağlantı korunur. Önceki kayıtlara
kendiliğinden üst hedef eklenmez. Hedef silinince alt kayıtlar korunur,
yalnız bağlantıları kaldırılır; Geri al hedefi ve bağlantıları geri getirir.
Yeni bağlantılar JSON yedeğine dahildir; eski yedekler aynı şekilde açılır.

Genel Sonraki adım kayıt formlarında, hedef panelinde ve bekleme penceresinde
gösterilmez; eski metinler korunur. Somut adım bağlı iş veya alt hedef olarak
açılır. Hedef formunda açıklama için Notlar kalır; Sapma/neden gösterilmez.
Haftalık/aylık teslim tarihi kayıt tarihinin yanındadır; senelikte yoktur.
İş günlüğünün oturuma ait alanları korunur.

Tamamlandı hedefi %100'dür. Diğer hedeflerde pozitif sayısal hedef önceliklidir;
mevcut değer boşsa sıfır kabul edilir. Sayısal hedef yoksa haftalık ilerleme
bağlı günlük işlerden; aylık, haftalık hedef yüzdelerinin; senelik, aylık
hedef yüzdelerinin eşit ağırlıklı ortalamasından hesaplanır. İptal ve arşiv
alt kayıtları sayılmaz. Uygun alt kayıt ve ölçüm yoksa açık hedef %0 kalır.
Hesaplanan ilerleme durumları kendiliğinden tamamlamaz. Haftalık günlük iş
özeti ayrıca görünür. Çalışma süreleri gösterilmez.

Açık ve kendi pozitif sayısal hedefi bulunan kayıtta -1 / +1 / Hedefe getir
mevcut değeri hızlı günceller. Mevcut değer alanına yazıp Değeri kaydet de
kullanılabilir. Durum kendiliğinden tamamlanmaz; değişiklik Geri al ile
geri alınır. Bağlı kayıtlardan hesaplanan ilerleme o kayıtlardan yönetilir;
boş hedefe ölçüm uydurulmaz. Kapalı hedefte hızlı ölçüm düzenlenmez.
Mevcut değer taslağı
kaydedilene veya Güncel değeri al ile sıfırlanana kadar tutulur.

Tabloda ilerleme 5 / 100, 1 / 2, 3 alt hedef, Tamamlandı veya Ölçüm yok
gibi kısa gösterilir. Özetin açıklaması ölçümün tamamını verir;
satır/başlık hedef panelini açar. Uzun ve çok satırlı ölçümler panelde
satırlara bölünür. Görüntüleme hesaplama yöntemini veya kayıtları değiştirmez.
Sorumlu alanı listede ve kayıt formlarında gösterilmez; mevcut değerler
kayıtlarda ve yedeklerde korunur. Günlük iş oluşturma formundaki eski Kategori alanı
gizlidir; saklanan değer korunur. Proje kodu ve İş türü girişleri de günlük
iş formlarında gösterilmez; eski değerler korunur.

Hedef notları kayıt formundaki Notlar alanından düzenlenir. Hedef ayrıntı
panelinde ayrı bir Hedef notu bölümü bulunmaz.

Günlük işte Bağlı haftalık hedef yeni seçimlerde yalnızca açık hedefleri
gösterir; Tamamlananları göster düğmesi kaldırıldı. Mevcut seçili kapalı
bağlantı, açıkça verilen kapalı hedef ve türe ait taslak korunur.

Listeler Açık görünümüyle başlar. Açık / Tamamlanan / Tümü düğmeleri kayıt
kapsamını seçer. Ayrıntılı Durum yalnız çalışma durumlarını daraltır;
Tamamlanan görünümünde gizlenir. Tümü, iptal ve eski aktarım kayıtları dahil
bütün kayıtları gösterir. Durum > Arşivlenenler yalnız eski haftalık
aktarımları daraltır. Hafta/ay/yıl kontrolleri kayıtları taşımaz.
Haftalık gezinmedeki Bu hafta plan dönemini seçer; Termin > Bu hafta teslim
teslim tarihini, Takip > Bu hafta takip ise sonraki takip tarihini süzer.

Bir hafta seçince, önceki haftalarda kalan açık hedefler Önceki haftalardan
alanında görünür. Açıp Bu haftaya taşı veya Seçili haftaya taşı ile hedefi
seçili haftaya al. Tüm haftalar görünümündeki eski açık hedefin sağındaki
ok, güncel haftaya taşır. Aynı kayıt devam eder; durum, ilerleme, teslim
tarihi ve bağlı işler korunur. Yeni kopya oluşmaz. Taşıma geçmişi yedeğe
girer; Geri al işlemi eski haftayı geri getirir. Otomatik taşıma yapılmaz;
bitmeyen hedef sonraki haftanın bekleyenleri arasında kalır.

Aylık hedeflerde de bir ay seçince Önceki aylardan alanı görünür.
Bu aya taşı / Seçili aya taşı aynı hedefi seçili aya alır; Tüm aylar
görünümündeki ok güncel aya taşır. İlerleme, teslim tarihi, durum,
bağlı haftalıklar ve senelik bağlantı korunur; alt kayıtların dönemleri
değişmez. Yeni kopya oluşmaz. Taşıma geçmişi yedeklenir ve Geri al
eski ayı geri getirir. Otomatik taşıma yapılmaz. Farklı bir yıla
taşınan hedefin senelik bağlantısını istersen ayrıca değiştirebilirsin.

Taşıma penceresinde hedef dönem ve isteğe bağlı Aktarma nedeni vardır.
Neden yazmadan da taşıyabilirsin. Dolu neden hedef panelindeki Plan
değişiklikleri bölümünden okunur; taşıma ve neden tek Geri al adımıdır.
Vazgeçmek kayıt değiştirmez.

Eski Aktarıldı hedefleri Arşivlendi adıyla Tümü görünümünde yer alır.
Yalnız bunları görmek için Durum > Arşivlenenler seçilebilir. Yeni haftaya
kendiliğinden taşınmaz;
özgün durum ve bağlı işler yedekte korunur. Formdaki Sonraki döneme
aktarılacak kutusu kaldırıldı; eski kayıtlardaki değeri saklanır.
Öncelik ve teslim tarihine tıklayarak satırdan düzenleyebilirsin.
Bu değişiklikler Geri al düğmesiyle geri alınabilir.
Genel bakışta da tarih ve öncelik aynı şekilde tıklanarak değiştirilir.

Filtreler kısa bir araç çubuğundadır. Küçük İş grubu / Durum / Öncelik /
Termin başlıkları görünür; kontrolün tamamına tıklanabilir.
Değişen seçimler vurgulanır. Temizle yerel iş grubu, durum, öncelik, tarih ve
eksik bağlantı filtrelerini kaldırır; kapsamı, sıralamayı, seçili plan
dönemini ve genel aramayı korur. Sıralama bir filtre sayılmaz ve tek başına
Temizle düğmesini göstermez. Günlük işlerde 3 gün içinde filtresi bugünden
itibaren üç gün içindeki açık işleri gösterir. Kayıtları değiştirmez.

Eksik hedef bağlantısı bildirimi yalnız aramayla eşleşen açık planlı işleri
sayar. Bu işleri göster çakışan yerel filtreleri temizleyip ilgili açık
işleri gösterir; genel arama ve sıralama korunur. Tamamlanmış işler sayılmaz.

Ayarlar tek kompakt ekrandır. Tema seçenekleri aynı satırdadır; proje/iş türü
listeleri tek tıkla açılır. Yedekleme açık başlar; indir/yükle doğrudan kullanılabilir.
Hedef ilerlemesi ve veri/listeler açıklamaları Yardım'a tıklayınca açılır.
Başlık ve alt düğmeler sabittir; genişleyen listeler kendi içinde kaydırılır.
Ayarlar > Tema altında Açık / Koyu / Sistem temaları vardır; tercih
otomatik saklanır ve Geri al ile geri alınabilir. Sistem, işletim sisteminin
temasını izler. Ayrı liste yoğunluğu seçimi kaldırıldı; tek kompakt yerleşim
kullanılır. Koyu tema siyaha yakın nötr zeminler kullanır; durum ve öncelik
renkleri korunur. Eski yoğunluk tercihi ve geri alma geçmişi korunur.

Altı liste ekranında sağ uçtaki küçük aşağı/yukarı ok sıralamayı açar.
Oluşturma - en yeni varsayılandır;
oluşturma tarihine göre en eski de seçilebilir. Senelik hedeflerde yalnız
oluşturma sıralaması kullanılır. Diğer teslim listelerinde yakın veya uzak
önce seçilebilir. Bekleyen konularda teslim yerine sonraki Takip tarihi
sıralanır. Tarihsizler iki yönde de sondadır. Sayfada en fazla 50 kayıt
görünür; arama, filtre, kapsam veya sıralama değişince ilk sayfaya dönülür.
Silme sonrası sayfa düzeltilir. Bunlar kayıtları ve geri almayı değiştirmez.

Tarih etiketine basınca yalnız takvim açılır; gün seçimi hemen kaydedilir.
Tarihi kaldır da hemen uygular. Çarpı, Escape veya dışarı tıklama seçim
yapmadan kapatır.
Tarihler GG.AA.YYYY sırasındadır. Türkçe takvimde ay ve yıl seçilebilir;
takvim ekranın içinde kalacak şekilde açılır. Öncelik menüsünde yalnız yazı
vardır; seçili satır yeşil ve tiklidir. Listede küçük bir bayrak gösterilir.
Liste etiketlerinde Düşük yeşil, Normal gri mor,
Yüksek kehribar, Acil vişne tonundadır. Listedeki etiketler hafif zeminlidir.
Sol baştaki küçük tik,
tek tıkla tamamlar (bekleyen konularda Kapandı); Geri al ile geri döner.

Açık günlük işlerde bugün ve sonraki 3 takvim günü içinde teslim edilecek
tarihler turuncu, gecikenler kırmızıdır. Günlük liste, Genel bakış, bağlı
işler paneli ve widget aynı kuralı kullanır. Kapalı işler nötr kalır.
Her tarih aynı etiket biçimindedir; renkli zemin ve kenarlık ayrımı güçlendirir.
Nokta yerine gecikende uyarı üçgeni, yakında saat, diğer tarihlerde takvim,
tarihsiz kayıtta kısa çizgi kullanılır. Üzerine gelince açıklaması okunur.

PROJE VE IS TURU

Günlük iş formunda Proje kodu ve İş türü girişi gösterilmez.
Eski kayıtlarındaki değerler, önceden verilmiş başlangıç bilgileri ve
ayrı form taslakları korunur; ilgisiz bir düzenleme bunları sıfırlamaz.
Eski değerler kayıtlarınla birlikte JSON yedeğine girer ve aramada bulunur.

Ayarlar bölümündeki proje kodu ve iş türü listelerine seçenek eklenebilir,
adları değiştirilebilir veya seçenekler listeden kaldırılabilir. Mevcut
kayıtların değerleri değişmez; kaldırılan seçenekler eski kayıtlardan yeniden
önerilmez. Liste değişiklikleri Geri al ile geri alınır. Yeni JSON yedekleri
listeleri de taşır; böyle bir yedeği yüklemek kayıtlarla birlikte tek Geri al
adımıdır. Yalnız kayıt içeren eski bir yedek mevcut listeleri korur.
Yedek, varsa proje/iş türü listelerini de taşır; görünüm tercihlerini veya
geri alma geçmişini dışa aktarmaz.

Haftalık, aylık ve senelik hedeflerde Beklemede yeni seçim olarak yoktur.
Bekleme günlük iş ve takiplerde yönetilir. Eski hedefin Beklemede değeri
korunur; seçili ama devre dışı görünür. Bu durumdan çıkılabilir, geri seçilemez.

Günlük işte yanıt, malzeme veya erişim bekliyorsan Durum > Beklemede seç.
Beklemede işin başlığındaki küçük saat simgesinin üzerine gelmek veya
klavyeyle odaklanmak bekleme nedenini gösterir. Simgeye tıklamak,
Enter veya Space doğrudan bekleme bilgisi formunu açar. Önizleme iş adını
tekrarlamaz. Düzenle düğmesi de aynı formu açar. Ayrı engel durumu yoktur.
Açılan Bekleme bilgisi penceresinde Neyi/kimi bekliyorum? alanı
isteğe bağlıdır. Vazgeç, seçilmiş Beklemede durumunu geri almaz; durum ve
ayrıntılar ayrı Geri al adımlarıdır. Beklemede işin durum menüsündeki
Bekleme bilgisi aynı pencereyi yeniden açar. Kayıt formunda neden yalnız
Beklemede günlük işte görünür; başka duruma geçmek saklanan nedeni silmez.

Eski engel işaretli açık günlük işler ilk güncellemede Beklemede olur.
Bekleme nedeni boşsa eski açıklama bu alana taşınır. Kapalı işler yeniden
açılmaz; tarihler, kaynaklar ve eski alanlar yedekte korunur. Dönüşüm tek
Geri al adımıdır ve yenilemek geri alınmış dönüşümü tekrarlamaz. Eski
alanları içeren yedekler okunur. Bekleme durumu sayacı kendiliğinden
başlatmaz veya durdurmaz.

Özgün kayıt bilgileri bölümü formdan kaldırıldı. Aktarımın otomatik eklediği
Gün / Gecikme / Odak Sıra notları kaynaklarıyla doğrulanarak temizlenir;
gerçek notlar korunur. Temizlik Geri al ile geri alınabilir ve yenilemek
geri alınmış temizliği tekrarlamaz. Gerekirse Ayarlar içindeki Aktarım
notlarını temizle ile yeniden yapılabilir. Ham kaynaklar yedekte korunur.

ANLIK ISLER

Eski Günlük Pop-Up İşler başlığına bağlı günlük işler, ilk güncel açılışta
haftalık bağdan ayrılıp Anlık iş grubuna taşınır. Durumlar, tarihler,
kategoriler ve notlar korunur. Eski haftalık satır silinmez; Arşivlenenler
altında Arşivlendi olarak kalır ve eski manuel hafta/ilerleme bilgileri korunur.
Gerçek haftalık hedeflerin bağlantıları değişmez.

Günlük listedeki Tüm işler / Planlı işler / Anlık işler filtresini kullan.
Yeni günlük iş haftalık hedefi yoksa Anlık iş olarak başlar. Haftalık hedef
seçince Planlı iş, bağlantıyı kaldırınca Anlık iş olur. Hedefin içinden
eklenen günlük iş planlı ve hedefi seçili açılır. Çalışma bağlamı seçimi
Ek bilgiler altında kalır; hedef bağlamadan elle Planlı iş de seçebilirsin.
Elle Anlık iş seçmek bağlantıyı kaldırır. Mevcut kaydı açmak bağlamı değiştirmez.
Dönüşüm tek Geri al adımıdır; geri aldıktan sonra yenilemek tekrar
uygulamaz. Gerekirse listede Anlık işlere taşı ile yeniden yapılabilir.

BEKLEYEN KONULAR VE TAKIP

Bekleyen konularda öncelik alanı veya öncelik filtresi kullanılmaz.
Gerçek takip geçmişi varsa başlıktaki küçük geçmiş simgesi, üzerine gelince
geçmişi gösterir; tıklamak takip penceresindeki geçmiş bölümünü açar.
Takip ekleme ve geçmiş düzeltmede Enter kaydeder; Shift+Enter satır ekler.
Bekleyen konularda kimden beklendiği, kaç gündür beklendiği, son takip,
sonraki takip ve son gelişme ayrı gösterilir. Düzenleme formunda Kimden
bekleniyor?, Son takip, Sonraki takip ve Son gelişme başlık/durumla ilk
bölümdedir; diğer alanlar sonradan gelen açık Ek bilgiler altındadır. Teslim tarihi
alanı kullanılmaz; eski teslim tarihleri saklanır. Açık konuda kimden beklendiği
veya sonraki takip tarihi eksikse Beklemeyi netleştir önerisi görünür; iki
haftadır hiç takip edilmemiş konuda son gelişme de istenir. Eksikler
tamamlanınca veya konu kapanınca o konu öneriden çıkar. Süre, Beklemeye başlama tarihi
ile bugün arasındaki takvim günü farkıdır; günlük hesaplanır ve 103 gün
gibi kısa gösterilir. Başlangıç tarihi üzerine gelince okunur; tarih
bilinmiyorsa çizgi görünür. Yeni kapanışta toplam süre o günde sabitlenir;
yeniden açılınca canlı hesap sürer. Eski kapalı konunun kayıtlı sayısal süresi
varsa ek kaynak açıklaması olmadan gösterilir; tek başına kapanış tarihi oluşturmaz.

Takip planla veya sonraki tarih düğmesi yalnız hatırlatmayı düzenler;
gerçekleşmiş takip kaydı oluşturmaz. Takip filtresi sonraki tarihi kullanır:
Takip gerekenler, Bugün takip, 3 gün içinde, Bu hafta takip, Gecikenler veya
Takip planı yok.
Takip gerekenler; tarihi bugün/geçmiş olan açık konuları ve plansızları toplar.
Geçen takip kırmızı; bugün ve üç gün içindekiler turuncudur.

Formdaki Son gelişme metnini düzeltmek tarihli takip geçmişi oluşturmaz.
Gerçekleşmiş görüşme veya hatırlatma Takip ettim ile kaydedilir.

Takip ettim penceresinde gerçekleşen tarih, isteğe bağlı kısa sonuç ve
sonraki takip tarihi birlikte kaydedilir. Gerçekleşen tarih ileri olamaz.
Son takip en yeni tarihi tutar; bu tarihteki dolu sonuç Son gelişmeyi
günceller. Eski görüşme bu alanları geriye götürmez; boş sonuç gelişmeyi silmez.
Konu durumu ve çalışma sayacı değişmez. Geçmişte her kayıt Düzenle ile tarih,
sonuç, sonraki takip tarihi ve varsa Önceki son gelişme metni üzerinden
düzeltilebilir. Aynı kayıt güncellenir; yeni görüşme eklenmez. Kapalı konunun
geçmişi yeniden açılmadan düzenlenebilir; yeni takip için konu açık olmalıdır.
Takipler JSON yedeğine girer; ekleme ve düzeltme ayrı birer Geri al adımıdır.
Tarih sırası yeniden hesaplanır; ayrıca elle düzeltilmiş güncel alanlar korunur.

Geçmişe kaydedilmemiş Son gelişme, yeni ve farklı bir takip sonucu tarafından
değiştirilecekse eski metin aynı kayıtta Önceki son gelişme olarak korunur;
ona görüşme tarihi uydurulmaz. Boş veya aynı sonuç eski metnin kopyasını
eklemez. Daha önce kaybolmuş metinler kendiliğinden geri getirilemez.

Kaynak değeriyle doğrulanan eski Kaç Gün Bekledi aktarım satırı temizlenir;
Son Durum, boşsa Son gelişme alanına taşınır. Gerçek Not ve kaynaklar
korunur. Düzenleme geri alınabilir; yenilemek geri alınmış temizliği
tekrarlamaz. Gerekirse Ayarlar > Bekleyen konu notlarını düzenle kullanılır.

Masaüstünde Genel bakış iki sıradır. Üstte Güncel işler ve Takvim aynı
hizada biter. Altta Takip gerekenler ve haftalık hedefler eşit genişlikte,
aynı yükseklikte iki paneldir. İşler ve hedefler kendi listelerinde kayar;
takip kartlarında sayfa geçilir. Dar/kısa ekranlarda normal sayfa kaydırılır.
Diğer altı liste ekranının akışı değişmez.

Genel bakışta sağ üstte Takvim, pazartesi başlayan kompakt ay görünümüdür.
Açık günlük iş ve haftalık/aylık hedeflerin teslim tarihlerini; bekleyen
konuların yalnız sonraki takip tarihlerini gösterir. Toplantının eski teslimi
ve senelik hedefler takvimde gösterilmez. Yalnız hafta/ay dönemi olan hedefe
tarih uydurulmaz. Kapalı kayıtlar gösterilmez; bağlı akışlar kendi
tarihlerinde görünür.

Gün seçince kayıtları açılır. Küçük ajandada başlık kesilmeden satıra bölünür;
kayıt türü altında küçük görünür. Teslim/takip tarihi satırda tekrarlanmaz.
Ay gezinmesi, gün ızgarası, seçili gün başlığı
ve ekleme kontrolü yerinde kalır; yalnız seçili günün kayıtları kendi
alanında kaydırılır. Büyüt, başlıkları gösteren Ay / Hafta
görünümünü açar; Escape kapatır. Büyük ay görünümünde her günün ilk iki
kaydı ve kalanların +N sayısı gösterilir; günü seçince bütün kayıtlara
ulaşılır. Mini veya geniş takvimden kayıt açmak arkadaki bölümü değiştirmez;
arama, filtreler ve kaydırma konumu korunur. Düzenleyici takvimin üzerinde açılır; formdan
dönünce seçili gün ve görünüm korunur, takvim açık kalır.
Büyük takvimde gün hücresinin boş alanına tıklamak o günü seçer. Hücredeki
kaydı açmak da seçimi kaydın tarihine taşır; dönüşte o gün açık kalır.
Takvimden Günlük iş / Bekleyen konu eklenebilir: seçili gün günlük işin
teslim tarihine veya bekleyen konunun sonraki takip tarihine hazırlanır.
Kayıt/açılış tarihi yeni kaydın açıldığı gündür. Kaydetmeden vazgeçmek kayıt
oluşturmaz. Ay/hafta/gün seçimi ve arama kayıtları değiştirmez.
Yeni bekleyen konuda Son takip boştur; kayıt açmak görüşme kaydı oluşturmaz.

Üst çubuktaki Takvim düğmesi, Genel bakıştan veya herhangi bir listeden aynı
takvimi açar. Bölüm, arama ve liste filtreleri değişmez; Escape kapatınca
klavye odağı düğmeye döner. Seçili gün ve görünüm korunur.

Takvimin altındaki Bu haftanın hedefleri, güncel haftanın açık hedeflerini
başlık, durum, değiştirilebilir teslim tarihi, ilerleme ve bağlı iş sayısıyla gösterir.
İlerleme ve Bağlı işler düğmeleri mevcut hedef panelinin ilgili bölümünü açar. Sayısal hedef ilerlemesi ile günlük işlerin
bitmesi ayrı gösterilir. Önceki haftaların açık hedefleri yalnız üstteki
Kalan hedefleri planla önerisinde yer alır; sağ panelde sayıları tekrarlanmaz.
Bu haftada açık hedef yoksa, en yakın gelecek haftanın açık hedefleri
Yaklaşan haftanın hedefleri başlığı ve hafta tarihleriyle gösterilir.
Bu önizleme kayıtların dönemini veya durumunu değiştirmez; Haftalık plan
gösterilen haftayı açar. Aynı haftadaki bütün açık hedeflere kendi içinde
kaydırılan listeden ulaşılır. Güncel veya yaklaşan hedef yoksa Hedef seç,
haftalık planı açar.

Takip gerekenler ve haftalık hedefler eşit genişlikte iki alt paneldir.
Başlıklarda Bekleyen konular / Haftalık plan bağlantıları vardır.
Takipte kart sayısı panel genişliğine göre ayarlanır; birden fazla sayfa
varsa Sayfa 1 / 2 gibi anlaşılır bir gösterge vardır. Durum rozeti menüyü açar;
tarihe tıklamak sonraki takip planını değiştirir.
Bu planlama geçmişe görüşme kaydı eklemez; Takip ettim gerçekleşen takibi kaydeder.
İki alt panelde genişliğe göre üç, iki veya bir kompakt kart sütunu kullanılır.
Takip ve hedef kartlarının ölçüleri aynıdır; tek kayıt bir kartlık yer kaplar.
Masaüstünde takip ve hedef iç kartları eşit genişlik/yüksekliktedir;
düğmeler alta hizalanır. Fazla hedef satırları aynı boyla listede kaydırılır.
İlerleme ve Bağlı işler düğmeleri hedef panelinin ilgili bölümünü açar.
Açmak kaydı değiştirmez; kaydedilmemiş hedef taslakları korunur.
Boş panellerde de ilgili listeye gitme bağlantısı görünür.
Bekleyen konunun sonraki takip tarihi bugün veya sonraki 3 gün içindeyse ya da
gecikmişse kart görünür. Toplantının eski teslim tarihi burada kullanılmaz.
Plansız, kapalı veya daha uzak gelecekteki konu kartlara alınmaz.
Temas işi olan bekleyen konu dış yanıt için kendi tarihiyle izlenir.
Kart sayfasını değiştirmek üstteki takvimi hareket ettirmez.

GENEL BAKIS PLANLAMA

Eski dört büyük kartın yerinde Planını netleştir şeridi vardır.
Yalnız uygun kayıt bulunan öneriler görünür:
Hedeflere adım planla: Bu haftanın sayısal hedefi ve uygun bağlı günlük
işi olmayan açık hedefleri.
Beklemeyi netleştir: Kimden beklendiği veya sonraki takip tarihi eksik
bekleyen konular (tarihsiz konu Takip gerekenler'de görünmez), iki haftadır
takip edilmemiş konularda son gelişme ve bekleme nedeni boş Beklemede günlük
işler. Satırda eksik olan yazar; Bilgi ekle o alana gider.
İşleri gözden geçir: En az yedi takvim günüdür güncellenmeyen ve üzerinde
çalışılmayan açık günlük işler; son yedi günde çalışma notu yazılan iş
sayılmaz. Hâlâ geçerli, Tamamla ve İptal doğrudan listede yapılır; Hâlâ
geçerli işi yedi gün listeden düşürür. Her biri tek Geri al adımıdır.
Kalan hedefleri planla: Önceki hafta ve ayların açık hedefleri; türü ve
dönemi gösterilir. Haftalıklar bu haftaya, aylıklar bu aya taşınabilir.
Her düğme ilgili kayıtları açar; arama bu önerileri de süzer. Sayılar
birleştirilmez; şeridi açmak kayıt değiştirmez veya zorunlu işlem başlatmaz.
Öneri yoksa şerit görünmez.
Her öneri satırındaki ⋯ düğmesi Yarın hatırlat, 1 hafta sonra hatırlat ve
Bir daha önerme seçeneklerini açar. Gizlenenleri göster ile ertelenen ve
gizlenen kayıtlar görülür, Yeniden öner ile geri getirilir. Aynı liste
Ayarlar > Gizlenen öneriler bölümünde türlerine göre de bulunur. Her biri
tek Geri al adımıdır.

Güncel işler filtresi Açık işler / Bugün teslim / Geciken / Bugünün odağı
seçeneklerini sunar. Bugün teslim, teslim tarihi bugün olan işleri gösterir.
Bugünün odağı için yıldızlardan en fazla 3 açık günlük işi elle seç.
Yıldıza tekrar basmak seçimi kaldırır; sayacı başlatmak odağa eklemez.
Teslim tarihi, durum ve hedef bağlantısı değişmez. Seçim focusDate alanıyla
JSON yedeğine girer ve Geri al ile geri alınır. Filtreyi açmak kayıt yazmaz.
Yeni günde önceki seçimler bugünün listesinde görünmez; eski odak tarihleri
kayıtta kalır ve gün değişimi kendiliğinden kayıt değiştirmez.

Bağlantıları gözden geçir, kapalı veya artık bulunamayan haftalık hedefe
bağlı açık planlı günlük işleri gösterir. Aynı adlı tek bir açık hedef varsa
önerilir. Hedefi kontrol et, uygulanacak işleri işaretle ve Bağlantıları
uygula düğmesine bas. Öneriyi görmek veya pencereyi açmak bağlantı kurmaz.
Yalnız işaretlenen kayıtlar değişir; işlem tek Geri al adımıdır. Durum,
teslim tarihi ve çalışma geçmişi korunur.

Toplantı ayrıntısında bağlı günlük işler ve takipler sayılı kompakt bölümlerdir.
Oluşturma başlık hizasındadır. Boş akışa mevcut açık ve başka kaynağa bağlı olmayan
günlük iş veya takip de bağlanabilir; işlem tek Geri al adımıdır. Hedef, durum,
tarihler ve geçmiş korunur. Mevcut kayıt yanındaki açma düğmesinden açılır.
Notlar boş değilse bağlantılardan sonra en sonda görünür. Toplantı, bekleyen konu
ve hedef panellerinde boş listeler ve kayıt bağlama alanları aynı biçimdedir.

Haftalık, aylık ve senelik hedef panellerinin sonunda mevcut Notlar alanı görünür.
Boşsa bölüm açılmaz; Hedefi düzenle ile düzenlenir.

CALISMAYA BASLA

Filtreler tek satırda kalır. Dar ekranda kendi satırında yatay kaydırılır;
alt satıra geçmez ve sayfayı genişletmez.
Sol altta yer olduğu ölçüde en fazla üç duraklatılmış iş görünür. İş adı notunu açar;
Devam et ayrıca çalışmayı sürdürür. Not okumak çalışan işi durdurmaz.
Not açılınca kart sabit menünün altındaki boşluktan yukarı doğru yararlanır.

Günlük işin Çalışmaya başla düğmesi sol altta o işe ait Çalışma notu alanını
açar. Çalışırken yazabilirsin; süre sayacı veya saat/dakika girişi yoktur.
Sol menü sekmeleri sabittir; kaydırılmaz ve adları tek satırda kalır.
Üst boşluklar ve not alanı ekran yüksekliğine göre sıkışır.
Duraklat sonuç istemez, taslağı koruyup alanı küçük özete indirir. Konu adına
veya kartın boş alanına tıklamak notu gösterir; açık duraklatılmış notta tekrar
tıklamak taslağı koruyarak küçültür. Kart kaydırılmaz; metin alanı
kalan yüksekliğe sığar. Çok kısa pencerelerde ek duraklatılmış satırlar azalır.
Altta çalışma geçmişi ve toplam kayıt sayısı tek satırdadır.
Devam et aynı nottan
sürdürür. Başka işe geçmek öncekini duraklatır; geri dönünce notu açılır.
Kaydedilen taslak yenileme ve pencere kapanışında korunur. Kaydetme hatası
veya başka pencereyle çakışma metni sessizce silmez; hata gösterilir.

Çalışma kartı etkinken Ctrl+P Duraklat / Devam et, Ctrl+Enter sonuç adımını açar.
Notun içinde yazıyor olmak gerekmez. Normal notta Enter işlem yapmaz, Shift+Enter alt satırdır.
Sonuç adımında Enter veya Ctrl+Enter kaydeder; ayrı formların klavye davranışı korunur.

Bitir, aynı not alanında Sonuç adımını açar. Notun hazır gelir; sonuç yazmak
isteğe bağlıdır. Boşsa çalışma kapanır ve geçmişe kayıt eklenmez. Vazgeçmek
taslağı korur. Kaydetme hatasında yeniden deneyebilirsin; kayıt çoğalmaz.
Bitirmek işin durumunu değiştirmez. Kaydedilmiş çalışma tek Geri al adımıdır.

Çalışma geçmişi ve haftalık yapılanlar sağda açılır; kayıt sayıları başlıktadır.
İş listesi görünür kalır.
Çalışma geçmişi kayıtları tarih ve sonuçla gösterir. İşin sağındaki geçmiş
simgesi o işin kayıtlarını, sol alttaki bağlantı haftalık geçmişi açar.
Tarih ve sonuç düzenlenebilir; eski hassas süreler, sonraki adımlar ve boş
sonuçlar kayıtta/yedekte aynen korunur. Düzenleme ve silme geri alınabilir.
Bağımsız Notlar kartı çalışma taslaklarından ayrıdır. Bitmemiş, boş olmayan
çalışma taslakları da JSON yedeğine dahildir. Onayda taslak sayısı gösterilir.
Yeni taslaklar duraklatılmış geri gelir. Aynı işe ait farklı yerel metin varsa
yükleme durur. Taslaksız eski yedekler mevcut çalışma notlarını korur.
Kayıtlar ve taslaklar birlikte tek Geri al adımıyla geri alınır.

Güncel işler başlığının yanında Açık işler / Bugün teslim / Geciken /
Bugünün odağı düğmeleri vardır.
Genel bakışta Sırala yoktur; sıra çalışan iş, geciken, bugün teslim, ileri
tarihli ve tarihsiz şeklindedir. Aynı grupta öncelik ve yakın teslim tarihi
belirler. Gerçekten çalışan satır hafif yeşildir; duraklatınca vurgu kalkar.
Devam ediyor durumu tek başına çalışmaya başlandığı anlamına gelmez. Arama ve
filtre çalışan işi de süzer. Bütün eşleşen işler doğrudan listelenir;
altı iş sınırı ve genişletme düğmesi yoktur, liste kendi içinde kayar. Tam liste
ekranlarındaki sıralama ve 50 kayıtlık sayfalama korunur.


TOPLANTI KARARINDAN ISE VEYA TAKIBE

Toplantı kaydında konu ve Alınan karar öndedir. Toplantı tarihi ve notlar
Ek bilgiler altındadır. Sorumlu/Katılımcılar girişleri kaldırıldı;
toplantı kayıtlarındaki değerleri ve aynı kaynak alanlarının kopyaları temizlenir.
Diğer kayıt türleri, karar/not/tarih ve bağlantılar korunur; temizlik geri alınabilir. Ayrı öncelik, teslim tarihi veya
sonraki adım alanı yoktur; eski değerler kayıtta ve yedekte korunur.
Aynı aksiyondan bir günlük iş ve bir bekleyen
konu açılabilir. Ben yapacağım benim çalışmamı; Başkasından bekliyorum dış
yanıtı takip eder. Formdan vazgeçmek kayıt oluşturmaz. İlgili türde kayıt
varsa düğme İşi aç / Takibi aç olur ve o kaydı açar; ikinci kopya oluşturmaz.

Listede Aksiyon / Karar, Durum, Bağlı iş, Takip ve İşlem sütunları vardır.
Açık / Kapalı / Tümü kapsamı seçilir. Bağlı iş veya takip varsa toplantı
durumu bunlardan hesaplanır: biri açıksa Açık, hepsi tamamlanmış veya iptal
edilmişse Kapandı. Durumu değiştirmek ilgili iş veya takip üzerinden yapılır.
Bağlantısız toplantıda Planlanacak / Açık / Kapandı elle seçilir.
Durum ve yönlendirme düğmeleri aynı ölçüdedir; sağ sütunlar kompakt ve sola
hizalıdır. Toplantıda tamamlama kutusu yoktur.
Bağlı iş ve takip kendi durumlarını kendi sütunlarında gösterir. Her akışın
düğmesi kaydı toplantı sayfasının üzerinde açar; kapatınca aynı yerde kalırsın.
Açık kararda akış yoksa İş oluştur / Takip oluştur formu açılır. Gerçek bağlı
kaydın tarihleri İş teslimi / Sonraki takip olarak gösterilir.
Öncelik ve teslim tarihi filtreleri bu listede kullanılmaz.
İş ve Takip rozetleri kendi gerçek kaydının menüsünü açar. Bu çocuk menülerinde
Tamamlandı / Kapandı tekrarlanmaz; tamamlama ilgili kaydın kendi arayüzündedir.

Her ikisi de, Yapacağım iş ve Beklediğim sonuç için iki ayrı bölüm içeren
formu açar. İki akışı kaydet ile birlikte oluşturabilirsin. Bir akış zaten
varsa bölümü salt okunur gösterilir; Eksik akışı ekle yalnız eksik olanı
kaydeder. Mevcut kayıt yeniden kullanılır, üzerine yazılmaz. Eksik
akışların kaydı tek atomik işlemdir. Vazgeçmek kayıt oluşturmaz;
kaydetme tek Geri al adımıdır.

Günlük iş kendi önceliği ve teslim tarihiyle yönetilir.
Beklenen yanıtın kimden beklendiği, sonraki takip tarihi ve son gelişmesi vardır.
Takip tarihi yanıtın teslim tarihi değildir; Son takip boş başlar.
Yeni akışlar toplantının eski tarih, öncelik, sorumlu veya sonraki adımını devralmaz.
Günlük iş ve takip ayrı yönetilir; toplantı ortak sonucu gösterir. Bir akış
yeniden açılırsa toplantı da Açık olur. Bağlı kayıtla toplantı özeti aynı
Geri al adımında güncellenir; eski tarih/öncelik/sorumlu/sonraki adım korunur.
Takvim, mini ajanda ve takip kartları toplantının eski teslimini kullanmaz;
gerçek iş teslimini ve bekleyen konunun sonraki takip tarihini kullanır.

Bekleyen konu için e-posta veya telefon gibi günlük bir temas adımı
açılabilir. Bu işi bitirmek dış yanıtı almak değildir; bekleyen konuyu
kapatmaz. Konunun takibi, kendi durumu ve tarihleriyle devam eder ve takip
kuyruğunda kalabilir. Outlook bağlantısı bu sürümde bulunmaz.

Kaydedilen iş günlüğü ve bitmemiş çalışma notu taslakları JSON kayıt yedeğine
dahildir. Yedekte bulunmayan işe ait taslak içeri alınmaz.

PAYLASIM PAKETI

Bu dagitim yeni bir tarayicida bos kayitlarla baslar. Kisisel is, hedef,
not, calisma gecmisi veya taslak icermez. Mevcut tarayici verileri silinmez.

MEVCUT KAYITLARINLA DEVAM ETMEK İÇİN

1. Önce eski ODAK'ı kullandığın Chrome profilinde aç. Ayarlar > Yedekleme >
   Yedeği indir ile güncel kayıtlarının JSON yedeğini al.
2. Açık ODAK ve widget pencerelerini kapat; eski pencere yardımcısının
   kapanması için 6 saniye bekle.
3. ZIP'i çıkar. İçindeki DOSYALARIN TAMAMINI daha önce kullandığın
   TAKIP.html dosyasının BULUNDUĞU AYNI KLASÖRE koy. Yeni TAKIP.html ile
   eskisini değiştir; dosya adını değiştirme.
4. Ana uygulama için ODAK.cmd'ye çift tıkla.
5. Widget (çalışma notu ve mini ajanda) için ODAK-Widget.cmd'ye çift tıkla. Ana uygulama kapalıyken
   de açılır; Bugün / Yarın sekmeleri aynı kayıt alanını izler.

İstersen bu iki CMD dosyasının Windows masaüstünde kısayolunu oluştur.
Dosyaları taşımak yerine kısayol oluştur; HTML, iki başlatıcı ve
ODAK-Pencere.ps1 aynı klasörde kalmalıdır. Chrome profil seçimi çıkarsa eski kayıtlarını
tuttuğun aynı profili seç.

YENİ KLASÖR VEYA FARKLI PROFİL

Kayıtlar HTML'nin içine geri yazılmaz; Chrome'un yerel depolamasındadır.
Dosyanın konumu veya Chrome profili değişirse kayıt alanı farklı olabilir.
Bu yüzden ZIP'i çıkardığın yeni klasörden çalıştırmak yerine yukarıdaki
aynı klasöre yerleştirme adımlarını uygula. Bu paketteki HTML, geliştirme
ortamındaki başlangıç kayıtlarını içerir; senin bilgisayarında sonradan
yaptığın düzenlemeler burada bulunmaz.

Kayıtların farklı görünürse önce dosyanın konumunu ve Chrome profilini
kontrol et. Gerekirse ilk adımda aldığın güncel JSON yedeğini Ayarlar >
Yedekleme > Yedeği yükle ile geri yükleyebilirsin.

PENCERELER ARASINDA GEÇİŞ

ODAK.cmd ile açılan ana uygulamadaki Widget düğmesi, AYRI ve küçük bir
widget açar; ana ODAK ekranı açık ve aynı görünümde kalır.
Bugün / Yarın sekmeleri, takvimde o güne ait açık teslim ve sonraki takip
kayıtlarını gösterir. Gecikenler, tarihi bugünden önce olan açık teslim
ve takipleri en eski tarihten başlayarak gerçek tarihleriyle gösterir.
Seçili listenin bütün kayıtları listenin içinde
kaydırılarak okunur; başlık ve gün sekmeleri sabit kalır. Ajanda salt
okunurdur; gün değiştirmek kayıtları değiştirmez. Başlık ilgili kaydı
ana ekranda açar. Ana uygulamadaki değişiklikler ve Geri al burada da görünür.
Widget'ın hedef içerik alanı 380x420 pikseldir. Tekrar tıklamak, açık
widget'ı yeniden kullanır; ana ekran yenilense bile widget bulunur.
Açılışta ölçüler sabitlenince ekran ölçeği ve pencere çerçevesine göre
dış boyut bir kez düzeltilir. Hedef 380x420 CSS piksel içeriktir.
Windows yardımcısı hazırsa tarayıcı ayrıca boyutlandırma yapmaz.
Normal HTML açılışında tarayıcı bir kez dener; öncesinde fare veya klavye
kullanılırsa bu deneme iptal edilir.
Sonraki elle boyutlandırmalar zorlanmaz; açık widget yeniden kullanılırken
boyutuna müdahale edilmez.

Windows paketinde başlıktaki Üstte tut düğmesi widget'ı diğer pencerelerin
üstünde tutar; tekrar basmak normal sıraya döndürür. Seçim açık widget
içindir. Normal tarayıcı açılışında bu düğme kullanılamaz.
ISLEM GECMISI (1.6.0)

Ayarlar > Islem gecmisi, geri alinabilen son islemleri (en fazla 30) listeler;
1 en son islemdir. Bir satirdaki Geri al yalniz o islemi geri alir, sonraki
islemler kalir; bu da ust cubuktaki Geri al ile geri alinabilir. Ayni kayit
sonradan yeniden degistiyse sorulur ve onaylanirsa o isleme kadar hepsi
sirayla geri alinir.

HEDEF ILERLEMESI (1.5.0)

Sayiyla olculen acik hedeflerde satirin uzerine gelince ilerleme kutusunun
yaninda - ve + belirir; her basis 1 degistirir ve tek Geri al adimidir.
Bagli islerden veya alt hedeflerden hesaplanan ilerlemede bu dugmeler yoktur.
Genel bakista hedef kartinin Ilerleme dugmesi dolan kutudur ("1 / 3").

WIDGET: IS AYRINTISI (1.4.7)

Siradaki isler ve Duraklatilanlar listesinde bir isin adina tiklamak isi
widget icinde acar: teslim, oncelik, aciklama, calisma notu ve son calisma
sonucu gorunur. ODAK'ta duzenle ana uygulamada formu acar; ada tekrar
tiklamak kapatir. ODAK'i ac, acik bir ODAK varsa ikinci pencere acmaz.
Calisilan isin ustteki basligi da ayni ayrintiyi widget icinde acar (1.4.8).

WIDGET: CALISMA GORUNUMU (1.2.0)

Widget Çalışma görünümüyle açılır. Bir iş çalışılıyorsa veya
duraklatılmışsa üstte o işin Çalışma notu alanı vardır; yazdıkların kendiliğinden
kaydedilir ve sol alttaki çalışma notuyla aynıdır. Duraklat / Devam et ve
Bitir ana penceredeki gibi çalışır (Ctrl+P, Ctrl+Enter). Bitir'de not Sonuç
olarak hazır gelir; Kaydet ve bitir sonucu çalışma geçmişine yazar, ana
penceredeki Geri al ile geri alınabilir.
Duraklatılan iş küçük bir özete iner (iş adı, geçmiş simgesi, Devam et / Bitir);
Devam et notu yeniden açar.
Duraklatılan işler ▶ Devam et ile, çalışılan iş yokken veya iş duraklatılmışken
Sıradaki işler ▶ ile başlatılır. Her işin yanındaki çalışma geçmişi simgesi o
işin kayıtlı sonuçlarını widget içinde gösterir.
Not iki pencerede aynı anda değişirse üzerine yazılmaz; Güncel notu yükle /
Bu notu kaydet seçenekleri çıkar.
Başlıktaki Ajanda düğmesi Bugün / Yarın / Gecikenler ajandasını açar; ajandada
çalışılan iş altta adıyla görünür. Widget'ı kapatmak, widget'ta çalışan işi
duraklatır; not korunur.

ODAK-Pencere.ps1, başlatıcı tarafından gizli çalıştırılan pencere yardımcısıdır.
Araç çubuğundaki Widget ve widget'taki ODAK'ı aç dahil yeni ODAK pencerelerini
ayarlar; zaten açık pencerelerin boyutuna dokunmaz. Ana ekran önerilen
1440x900 boyutta (sığmazsa büyütülmüş), widget küçük açılır. İkisinin ölçüsü Chrome'un süreç geneline uygulanmaz.
Son ODAK penceresi kapanınca yardımcı da kısa süre sonra kapanır. Eksikse
veya başlatılamazsa uygulama yine açılır ve boyut ayarının uygulanamadığı
bildirilir; dosyayı HTML ve CMD dosyalarıyla aynı klasörde tut.

Widget'ta ODAK'ı aç düğmesi, açık ana ODAK penceresi varsa onu kullanır;
widget küçük kalır ve ikinci bir ana ekran oluşmaz. Ana ekrandaki arama
ve kaydedilmemiş açık form korunur. Bir iş başlığına tıkladığında ilgili
kayıt ana ekranda açılır; başka bir form açıksa önce onu tamamlamalısın.
Chrome öne getirmeyi engellerse ODAK'ın açık olduğu bilgisi gösterilir;
görev çubuğundan ODAK'ı seçebilirsin.

Açık ana ekran yoksa widget ekranın kullanılabilir alanına göre AYRI bir ana
ODAK penceresi açar; widget'ın
kendisi küçük ve açık kalır. Ana ekranı kapatmak ya da yenilemek widget'ı
kapatmaz; widget'ı kapatmak ana ekranı kapatmaz. Bu davranış için eski
pencereleri kapatıp paketin güncel HTML dosyasıyla yeniden aç.

Ana uygulama ve ajanda aynı anda ayrı pencerelerde dursun istersen
ODAK.cmd ve ODAK-Widget.cmd'yi ayrı ayrı çalıştır.

TAKIP.html'ye doğrudan çift tıklamak normal Chrome görünümünü açar.
Normal Chrome içindeki Widget düğmesi de eski tarayıcı açılır penceresini
açar; adres çubuğunu gizlemek için CMD başlatıcılarını kullan.

Chrome kapatılır veya Windows yeniden başlatılırsa pencereleri yeniden
açman gerekir. Üstte tut seçimi kapalıyken widget normal pencere sırasını
izler; kendiliğinden başlangıca
eklenmez. Kayıtların ve geri alma geçmişin aynı çalışma alanında kalır.
`;

await mkdir(directory, { recursive: true, mode: 0o700 });
await writeFile(
  resolve(directory, "TAKIP.html"),
  await readFile(resolve(local, "TAKIP.html")),
  { mode: 0o600 },
);
await writeFile(
  resolve(directory, "ODAK.cmd"),
  createWindowsLauncher("desktop"),
  {
    mode: 0o600,
  },
);
await writeFile(
  resolve(directory, "ODAK-Widget.cmd"),
  createWindowsLauncher("widget"),
  { mode: 0o600 },
);
await writeFile(
  resolve(directory, "ODAK-Pencere.ps1"),
  "\ufeff" + windowHelperSource(),
  { mode: 0o600 },
);
await writeFile(resolve(directory, "KULLANIM.txt"), "\ufeff" + guide, {
  mode: 0o600,
});
await writeFile(resolve(directory, "ODAK.ico"), createWindowsIcon(), {
  mode: 0o600,
});
await writeFile(resolve(directory, "ODAK-Widget.ico"), createWindowsIcon(true), {
  mode: 0o600,
});
await writeFile(resolve(directory, "ODAK-Kisayol-Kur.ps1"), createWindowsShortcutSetup(), {
  mode: 0o600,
});
await writeFile(resolve(directory, "ODAK-Kisayol-Kur.cmd"), createWindowsShortcutSetupLauncher(), {
  mode: 0o600,
});

// Python is needed only on the export machine, never on the user's Windows PC.
execFileSync(
  "python3",
  [
    "-m",
    "zipfile",
    "-c",
    archive,
    "TAKIP.html",
    "ODAK.cmd",
    "ODAK-Widget.cmd",
    "ODAK-Pencere.ps1",
    "KULLANIM.txt",
    "ODAK.ico",
    "ODAK-Widget.ico",
    "ODAK-Kisayol-Kur.cmd",
    "ODAK-Kisayol-Kur.ps1",
  ],
  { cwd: directory, stdio: "pipe" },
);
await chmod(archive, 0o600);
await copyFile(archive, versionedArchive);
await chmod(versionedArchive, 0o600);
console.log(
  `Masaüstü paketi hazır: .local/ODAK-Masaustu-${version}.zip. Mevcut kayıtlar için dosyaları eski TAKIP.html ile aynı klasöre yerleştirin.`,
);
