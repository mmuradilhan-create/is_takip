# Odak

PC kullanımına odaklanan, Türkçe kişisel iş ve hedef takibi. HTML/CSS/JavaScript tabanlıdır. Güncel sürüm: **0.21.29**.

## Kullanım

Hazırlanan `.local/TAKIP.html` tek dosyadır; ek program kurulmadan modern tarayıcıda açılır. Günlük işler, haftalık plan, aylık/senelik hedefler, toplantı aksiyonları ve bekleyen konular aynı çalışma alanındadır. Pencere veya yan panel dışındaki boş alana tıklamak açık pencereyi kapatır; içte açılan pencere önce kapanır. Kayıt formunda kaydedilmemiş değişiklik varsa dışarı tıklama, Escape veya kapatma düğmeleri değişiklikleri atmadan önce onay ister.

- Sayfa başlığı ve **Yeni kayıt** düğmesi üst çubuktadır; tekrarlayan büyük başlık alanı yoktur. Sol menü sabittir ve kaydırılmaz; kısa ekranlarda menü aralıkları daralır.
- **Yeni kayıt** ile iş veya hedef ekleyin; günlük işin satırına veya başlığına tıklayarak düzenleyin. Hedef, toplantı ve bekleyen konu başlıkları sağda ayrıntıları açar; sağdaki kalem kayıt formuna götürür. Sol baştaki boş tamamlama kutusu tek tıkla tamamlar; **✓** yalnız tamamlanmış kayıtlarda görünür. Tamamlanan başlıklar soluk renkte kalır; üstleri çizilmez. İptal edilen kaydın soldaki kutusunda çarpı görünür; başlığı soluk ve üstü çizilidir. İlerleme sütununda çubuk veya yüzde yerine — gösterilir; kaydedilmiş ölçümler ayrıntıda korunur. İptal edilen alt kayıt, üst hedefin ilerleme hesabına katılmaz. Günlük işlerin en sağındaki **▶ Çalışmaya başla** çalışma oturumunu başlatır. Durum etiketi kaydın bulunduğu listeye uygun durum seçeneklerini açar; toplantı dışındaki listelerin hızlı menüsünde tamamlama tekrarlanmaz. Durum, tarih, öncelik, sonraki aksiyon ve listeye özel alanlar saklanır.
- Kayıt formunda yalnızca alanlar kaydırılır; başlık ve alttaki **Kaydı sil / Vazgeç / Değişiklikleri kaydet** çubuğu görünür kalır. Uzun formlarda kaydetmek için en alta inmek gerekmez. Mevcut kaydı düzenlerken de temel alanlar kayıt türüne göre öne çıkar; diğer alanlar temel bilgilerden sonra açık **Ek bilgiler** altında kalır; istersen kapatabilirsin.
- Altı kayıt türünün formunda temel alanlar dengeli sütunlarda yer alır; dar ekranda tek sütuna iner. İsteğe bağlı alanlar **Ek bilgiler** altında toplanır; yalnız başlık zorunludur. Hedeflerde sayısal ölçüm kapalı başlar. Açıldığında hedef değer ve birim boş, mevcut değer **0** gelir; bunlar isteğe bağlıdır. Pozitif hedef girilirse kendi ölçümü önceliklidir; ölçüm olmadan ilerleme bağlı adımlardan hesaplanır.
- İsterseniz günlük işleri haftalık, haftalık hedefleri aylık, aylık hedefleri senelik hedeflere bağlayın. Bu bağlantılar isteğe bağlıdır; önceki kayıtlara kendiliğinden eklenmez.
- Uygulama adı **Odak** olarak sabittir. Sol menüde büyük harfli, geometrik **ODAK** marka yazısı bulunur; simge ve slogan kullanılmaz. **Ayarlar → Görünüm** altında **Açık / Koyu / Sistem** temaları vardır; seçim otomatik kaydedilir. Koyu tema siyaha yakın nötr zeminler kullanır; durum ve öncelik renkleri korunur. Sistem seçimi işletim sisteminin temasını izler. Listeler tek kompakt yerleşim kullanır; ayrı liste yoğunluğu seçimi kaldırılmıştır. Eski yoğunluk tercihleri ve geri alma geçmişi korunur.
- **Ayarlar** tek kompakt ekrandır: tema seçenekleri aynı satırda, proje kodu/iş türü listeleri tek tıkla açılır. Yedekleme açık başlar; indir/yükle düğmelerine doğrudan erişilir. Hedef ilerlemesi ve veri/listeler hakkındaki açıklamalar kapalı **Yardım** bölümünde açılır. Başlık ve alt düğmeler sabit kalır.
- Üst çubukta tarihin altında yerel saat büyük ve belirgin saat:dakika biçiminde görünür; dakika geçişinde ve pencereye dönüldüğünde otomatik güncellenir.
- Kayıtlar ve görünüm ayarları bu tarayıcıda otomatik saklanır. HTML dosyasının içine geri yazılmaz; hesap veya cihazlar arası senkronizasyon yoktur.
- **Ayarlar → Çalışma alanını sıfırla** bu tarayıcıdaki tüm kayıtları sayıyı belirten bir onaydan sonra temizler. Görünüm tercihi korunur. Boş kayıt alanı kalıcı saklanır; sayfa yenilenince paketin başlangıç kayıtları kendiliğinden geri gelmez. Yedekleme bölümünden JSON yedeğini seçerek kayıtlar geri yüklenebilir.
- İsteğe bağlı kayıt yedeği, ayarlardaki **Yedekleme** bölümündeki **Yedeği indir / Yedeği yükle** düğmelerinden JSON olarak alınır ve geri yüklenir. Geri yükleme mevcut kayıtları değiştirmeden önce açık onay ister. Günlük kullanımda Excel içe/dışa aktarma yoktur.

Tarayıcı verilerinin silinmesi kayıtları da silebilir. Dosya sürümünü güncellerken aynı dosya adı, konumu ve tarayıcıyla devam edin; yerel dosya depolamasının davranışı tarayıcıya bağlıdır. Tarayıcıda sonradan düzenlenen kayıtları bu geliştirme ortamı göremez; yeniden HTML üretmek bu kayıtları dosyaya gömmez. İsteğe bağlı JSON yedeği cihaz değiştirme ve veri koruma içindir.

Kayıt durumları Excel'deki özgün sekmelere göre ayrıdır; form ve hızlı durum menüsü kaydın listesine uygun seçenekleri kullanır:

- Günlük işler: **Yapılacak, Devam ediyor, Beklemede, Tamamlandı, İptal**.
- Haftalık, aylık ve senelik hedefler: **Yapılacak, Devam ediyor, Tamamlandı, İptal**. Beklemeyi günlük iş ve takipte yönetin. Eski hedeflerin Beklemede değeri korunur; düzenleyicide seçili ama devre dışı görünür. Bu durumdan çıkılabilir, yeniden seçilemez.
- Toplantı aksiyonları: **Açık / Kapalı / Tümü** ile ayrılır. Ayrı **Durum** sütunu, bağlı iş veya takipten biri açıksa **Açık**, hepsi kapalıysa **Kapandı** gösterir. Bağlantı olmayan toplantıda **Planlanacak / Açık / Kapandı** elle seçilir.
- Bekleyen konular: **Açık, Takipte, Cevap bekleniyor, Kapandı**.

Eski **Kısmi tamamlandı** durumu artık seçeneklerde bulunmaz; mevcut kayıtlar **Devam ediyor** olarak gösterilir ve bu filtreye dahil edilir. Görüntüleme, filtreleme ve yedek alma özgün değeri değiştirmez; durum dışındaki doğrudan düzenlemelerde de korunur. Bağlantısız toplantılarda eski açık durumlar **Açık**, eski kapalı durumlar **Kapandı** olarak gösterilir; ham değer ancak açıkça durum seçilince güncellenir. Bağlantılı toplantının durumu bağlı kayıtlardan hesaplanır. **Geri al** özgün değeri geri getirir. Önceki sürümde başka bir listeden seçilmiş diğer durumlar varsa mevcut kayıtta ve filtrede gösterilmeye devam eder; kendiliğinden değiştirilmez. Kayıt türü formda değiştirildiğinde durum seçenekleri yeni listeye uyarlanır. Menüde yön tuşlarıyla seçim yapılabilir; Escape menüyü kapatır. Satır klavyeyle odaklanıp Enter ile de düzenlenebilir. Klavye odağı satırı hafifçe renklendirip başlığın altını çizer; bütün satırı çevreleyen çerçeve kullanılmaz.

## Ortak iş ve hedef listeleri

Günlük işler, haftalık plan, aylık ve senelik hedefler aynı kompakt tablo, filtreler ve satır etkileşimlerini kullanır. Haftalık ve aylık hedef ekranlarında **Hedef / Durum / Öncelik / Teslim tarihi / İlerleme** sütunları bulunur. Günlük işlerde ilerleme sütunu kullanılmaz. Kişisel kullanımda **Sorumlu** sütunu gösterilmez. Yeni ve mevcut kayıt formlarında Sorumlu girişi gösterilmez. Toplantı kayıtlarındaki Sorumlu/Katılımcılar değerleri temizlenir; diğer türlerin verileri korunur.

Senelik hedeflerde yıl/dönem yeterlidir; teslim tarihi sütunu, **Termin** filtresi, teslim sıralaması ve form alanı kullanılmaz. Takvimde senelik hedefin kendi tarih kaydı gösterilmez; aylık alt hedef ve günlük iş tarihleri korunur. Eski senelik tarihler kayıtlarda ve JSON yedeklerinde aynen saklanır; yeni senelik hedefler teslim tarihi olmadan oluşturulur.

Satır işlemleri sağ uçta aynı küçük simge düğmeleriyle gösterilir; üzerlerine gelince büyük harfle başlayan açıklamaları okunur ve klavyeyle kullanılabilirler. Hedeflerde satır veya başlık ayrıntı panelini, sağdaki **kalem** kayıt formunu ve **+** bir alt düzeyin yeni kayıt formunu açar: haftalık → günlük iş, aylık → haftalık hedef, senelik → aylık hedef. Günlük işlerde çalışma geçmişi ve başlatma düğmeleri aynı alandadır. Kaydı satıra veya başlığa tıklayarak açabilirsiniz; bunu tekrarlayan ayrı açma düğmesi bulunmaz. Başlığın altında işlem düğmeleri veya bağlı iş sayısı tekrarlanmaz.

Satır altında yalnız işe yarayan bağlam gösterilir. Günlük işlerde, haftalık ve aylık hedef listelerinde ve Genel bakış kartlarında bağlı üst hedef, başlık yanındaki küçük hedef simgesinden açılır; üzerine gelince tam adı hızlı açılan, beyaz zeminli ve yeşil kenarlıklı uygulama balonunda okunur. Kaynak kayıt ve not simgeleri de aynı gruptadır; kaynak simgesi toplantı veya bekleyen konu ayrıntısını sağda açar. Not simgesi üzerine gelince gerçek notu önizler; tıklamak doğrudan Notu düzenle penceresini açar. Hedef bağlantısı altta tekrarlanmaz ve boş alt satır bırakılmaz. Anlık iş, iş türü ve proje kodu etiketleri gösterilmez. Bağlantı metni alt satırda tekrarlanmaz; dönem bilgisi ayrı kalır. **Tüm haftalar / aylar / yıllar** görünümünde dönem **16–22 Kasım 2026 / Kasım 2026 / 2026** gibi okunur; seçili dönem üstte yazıyorsa satırda tekrarlanmaz. Toplantı satırında karar ve varsa toplantı tarihi görünür. Bölüm adları veya boş alt satırlar eklenmez; bu görünüm kayıtları değiştirmez.

Aynı sağ panel haftalık, aylık ve senelik hedeflerde **İlerleme → Bağlı işler / alt hedefler** sırasını kullanır. **Hedefi düzenle** formu paneli kapatmadan açılır; form kapanınca aynı hedef, kaydırma ve kaydedilmemiş ilerleme taslağı korunur. Panel açıkken başka kayıt, menü veya düğmeye tıklamak o işlemi ilk tıklamada çalıştırır; boş alana tıklamak paneli kapatır. Üst çubuktaki **Geri al** panel açıkken de çalışır ve paneldeki bilgileri günceller. Dönemler hafta tarihleri, ay adı veya yıl olarak okunur. Alt hedefe veya üst hedef bağlantısına tıklayarak panel içinde ilerleyebilirsiniz. Haftalık hedefin günlük işleri açık olanlar önce ve yakın teslim tarihine göre sıralanır; soldan tamamlanır ve sağdan çalışmaya başlanır. Paneldeki **Yeni adım / Yeni haftalık hedef / Yeni aylık hedef**, üst hedefi hazır seçili formu açar; vazgeçmek kayıt oluşturmaz. **Mevcut … bağla**, uygun türdeki açık ve başka hedefe bağlanmamış kayıtları sunar; başka bir hedefin kaydını sessizce taşımaz. Günlük anlık işler bu seçime dahil edilmez.

Hedef notları kayıt formundaki **Notlar** alanında saklanır ve düzenlenir; hedef ayrıntı panelinde ayrı bir **Hedef notu** bölümü bulunmaz.

Haftalık ve aylık hedefin kayıt formundaki **Bağlı aylık / senelik hedef** alanı isteğe bağlıdır. Mevcut kapalı bağlantılar seçili kalır. Hedef silinirse alt kayıtlar korunur ve yalnız bu hedefe bağlantıları kaldırılır; **Geri al** hedefi ve bağlantıları birlikte geri getirir. Yeni bağlantılar JSON yedeğine dahildir; eski yedekler açılırken yeni bağlantı kurulmaz.

Genel **Sonraki adım** kayıt formlarında, hedef panelinde ve bekleme penceresinde gösterilmez; eski metinler kayıtta ve yedekte korunur. Sonraki somut iş, bağlı günlük iş veya alt hedef olarak açılır. İş günlüğünün oturuma ait alanları korunur. Hedef kayıt formunda açıklama için **Notlar** vardır; **Sapma / neden** alanı gösterilmez. Haftalık ve aylık teslim tarihi ana bölümde dönem bilgisinin ardından görünür; senelik hedefte teslim tarihi kullanılmaz.

Günlük iş formundaki **Bağlı haftalık hedef** yeni seçimlerde yalnızca açık hedefleri sunar; **Tamamlananları göster** düğmesi kaldırıldı. Mevcut seçili kapalı bağlantı, açıkça verilen kapalı hedef ve türe ait taslak korunur; kayıt açmak bağlantıyı kendiliğinden değiştirmez.

Tamamlandı durumundaki hedefin ilerlemesi **%100** olur. Diğer hedeflerde pozitif sayısal hedef varsa **7/10 rapor** gibi ölçüm önceliklidir; mevcut değer boşsa sıfır kabul edilir. Sayısal hedef yoksa haftalık ilerleme uygun günlük işlerin tamamlanma oranıdır; aylık ilerleme bağlı haftalık hedef yüzdelerinin, senelik ilerleme bağlı aylık hedef yüzdelerinin eşit ağırlıklı ortalamasıdır. İptal veya arşivlenmiş alt kayıtlar hesaplanmaz. Bağlı kayıt ve sayısal hedef yoksa açık hedef **%0** kalır. Hesaplanan ilerleme hiçbir kaydı kendiliğinden tamamlamaz; haftalık günlük iş özeti ayrıca görünür.

Tablodaki ilerleme kısa gösterilir: **5 / 100**, **1 / 2**, **3 alt hedef**, **Tamamlandı** veya **Ölçüm yok**. Özetin üzerine gelince ölçümün tamamı okunur; satır veya başlık hedef panelini açar. Uzun ve çok satırlı ölçüm metni panelde satırlara bölünerek okunur. Bu görünüm hesaplama yöntemini, hedef değerlerini veya kayıtları değiştirmez.

Açık ve kendi pozitif sayısal hedefi bulunan kayıtta **−1 / +1 / Hedefe getir** ile mevcut değer hızlı güncellenir. **Mevcut değer** alanına doğrudan sayı yazıp **Değeri kaydet** de kullanılabilir. Bu işlemler durumu kendiliğinden tamamlamaz; her değişiklik **Geri al** ile geri alınabilir. Bağlı iş veya alt hedeflerden hesaplanan ilerleme o kayıtlardan yönetilir; boş hedefe ölçüm uydurulmaz. Kapalı hedeflerde hızlı ölçüm kontrolleri salt okunurdur. Mevcut değer taslağı kaydedilene veya **Güncel değeri al** ile sıfırlanana kadar tutulur.

Listeler **Açık** görünümüyle başlar. Üstteki **Açık / Tamamlanan / Tümü** düğmeleri kayıt kapsamını seçer. Ayrıntılı **Durum** filtresi yalnızca çalışma durumlarını daraltır; açık ve tamamlanan seçimini tekrarlamaz. **Tamamlanan** görünümünde bu filtre gizlenir. **Tümü**, iptal ve eski aktarım kayıtları dahil bütün kayıtları gösterir; **Durum → Arşivlenenler** seçimi yalnızca eski haftalık aktarımları daraltır. Her bölümün kendi durum seçenekleri korunur.

Haftalık, aylık ve senelik ekranlarda önceki/sonraki dönem, **Bu hafta / Bu ay / Bu yıl** ve **Tüm haftalar / aylar / yıllar** kontrolleri vardır. İlk görünüm tüm dönemleri kapsar. Dönem seçimi kaydın geçerli dönem bilgisini esas alır; dönem bilgisi yoksa teslim tarihi kullanılır. Haftalık gezinmedeki **Bu hafta** plan dönemini seçer; **Termin → Bu hafta teslim** ise teslim tarihi bu hafta olan kayıtları süzer. Bekleyen konulardaki **Takip → Bu hafta takip**, sonraki takip tarihini esas alır. Tarih filtresi seçili plan dönemiyle birlikte uygulanır. Yeni hedef formunda seçili dönem, seçim yoksa güncel dönem hazır gelir. Dönem filtreleri kayıtları yeniden tarihlemez veya sonraki döneme taşımaz.

Bir hafta seçildiğinde, önceki haftalarda kalan açık hedefler **Önceki haftalardan** alanında bekler. Alanı açıp **Bu haftaya taşı** veya **Seçili haftaya taşı** ile aynı hedefi seçili haftaya alabilirsiniz. **Tüm haftalar** görünümündeki eski açık hedefin sağındaki ok, hedefi güncel haftaya taşır. Kimlik, durum, ilerleme, teslim tarihi ve bağlı günlük işler korunur; yeni hedef kopyası oluşmaz. Taşıma geçmişi yedeğe girer ve işlem **Geri al** ile geri alınabilir. Hafta değişince otomatik taşıma yapılmaz; bitmeyen hedef sonraki haftanın bekleyenleri arasında kalır.

Bir ay seçildiğinde, önceki aylarda kalan açık aylık hedefler **Önceki aylardan** alanında görünür. **Bu aya taşı / Seçili aya taşı**, aynı hedefin plan ayını değiştirir. **Tüm aylar** görünümündeki taşıma oku güncel aya taşır. İlerleme, durum, teslim tarihi, bağlı haftalıklar ve senelik hedef bağlantısı korunur; alt hedeflerin dönemleri değişmez. Taşıma geçmişi yedeğe girer ve **Geri al** ile eski ayına döner. Ay değişince otomatik taşıma yapılmaz. Farklı bir yıla taşıdıysanız senelik bağlantısını ayrıca değiştirebilirsiniz.

Haftalık veya aylık hedefi taşırken açılan kısa pencerede hedef dönem ve isteğe bağlı **Aktarma nedeni** bulunur. Neden yazmadan da taşınabilir. Dolu neden aynı taşıma kaydıyla saklanır ve hedef ayrıntısındaki **Plan değişiklikleri** bölümünden okunur. Taşıma ve neden tek **Geri al** adımıdır; vazgeçmek kayıt değiştirmez.

Haftalık listede eski **Aktarıldı** kayıtları **Arşivlendi** adıyla **Tümü** görünümünde yer alır; yalnız bunları görmek için **Durum → Arşivlenenler** seçilebilir. Bunlar eski haftaların kayıtlarıdır; kendiliğinden açık hedefe çevrilmez veya yeni haftaya taşınmaz. Özgün durumları ve bağlı işleri yedekte korunur. Formdaki işlevsiz **Sonraki döneme aktarılacak** kutusu kaldırılmıştır; eski kayıtların bu alanı saklanır.

Öncelik satırdan düzenlenebilir; teslim tarihi kullanılan listelerde tarih de aynı şekilde değiştirilebilir. Öncelik menüden seçilince kaydedilir; tarih etiketine basınca yalnız takvim açılır. Gün seçimi tarihi hemen kaydeder; **Tarihi kaldır** da tarihi hemen boşaltır. Çarpı, Escape veya dışarı tıklama, gün seçmeden kapatır. Aynı değer tekrar seçilirse kayıt ve geri alma adımı oluşturulmaz. Gerçek değişiklikler mevcut **Geri al / Ctrl+Z** akışını kullanır.

Filtreler kısa bir araç çubuğunda yer alır. Küçük **İş grubu / Durum / Öncelik / Termin** başlıkları seçimlerin anlamını korur; kontrolün tamamına tıklanabilir. Varsayılandan farklı seçimler vurgulanır; **Temizle** yerel iş grubu, durum, öncelik, tarih ve eksik bağlantı filtrelerini kaldırır. Seçili **Açık / Tamamlanan / Tümü** kapsamı, sıralama, plan dönemi ve genel arama korunur. Sıralamayı değiştirmek bir filtre sayılmaz ve tek başına **Temizle** düğmesini göstermez. Günlük işlerdeki **3 gün içinde**, bugün ve sonraki üç takvim gününde teslim edilecek açık işleri gösterir. Filtre işlemleri kayıtları veya geri alma geçmişini değiştirmez.

Günlük listedeki eksik hedef bağlantısı bildirimi yalnız aramayla eşleşen açık planlı işleri sayar. **Bu işleri göster**, çakışan yerel filtreleri temizleyip ilgili açık işleri gösterir; genel arama ve sıralama korunur. Tamamlanmış işler bu bildirime dahil edilmez ve listeyi açmak kayıt değiştirmez.

Altı liste ekranında sıralama, araç çubuğunun sağ ucundaki küçük **aşağı/yukarı ok** düğmesinden seçilir. Güncel sıralama düğmenin açıklamasında görünür. Varsayılan **Oluşturma · en yeni**, yeni açılan kayıtları önce gösterir; oluşturma tarihine göre eskiden yeniye de sıralanabilir. Senelik hedefler yalnız oluşturma tarihine göre sıralanır. Diğer teslim tarihi listelerinde **Teslim · yakın önce / uzak önce**, teslim tarihini iki yönde sıralar; tarihsizler her iki yönde de sonda kalır. Bekleyen konularda bunun yerine **Takip · yakın önce / uzak önce**, sonraki takip tarihini kullanır. Her sayfada en fazla **50 kayıt** gösterilir. Arama, filtre, kapsam veya sıralama değişince ilk sayfaya dönülür; silme sonrası artık olmayan sayfa düzeltilir. Sıralama ve sayfa değişimi kayıtları, tarihlerini veya geri alma geçmişini değiştirmez.

Tarih alanları tarayıcı dilinden bağımsız **GG.AA.YYYY** sırasındadır. Türkçe takvimde ay/yıl seçilebilir; pencerenin altında açıldığında takvim alanın üstüne yerleşir ve ekran içinde kalır. Teslim, kayıt/açılış ve son takip tarihlerinde aynı seçici kullanılır; yedeklerde tarih yine ISO biçiminde tutulur. Öncelik menüsü durum menüsü gibi yalnız yazıdan oluşur; seçili satır yeşil vurgulanır ve tikle belirtilir. Listede önceliğin yanında küçük bir bayrak bulunur: Düşük yeşil, Normal gri mor, Yüksek kehribar, Acil vişne tonundadır. Hafif zeminli etiketler kullanılır. Sol baştaki boş tamamlama kutusu, bekleyen konularda **Kapandı** durumunu uygular; diğer kayıtları tamamlar. Bu işlem geri alınabilir; sayısal hedef değerlerini değiştirmez.

Açık günlük işlerde bugün ve önümüzdeki **3 takvim günü** içinde teslim edilecek tarihler turuncu, geciken tarihler kırmızıdır. Bütün teslim tarihleri aynı biçimde küçük bir tarih etiketi olarak gösterilir; yalnız geciken satırlara eklenen metin kaldırılmıştır. Renkler açık zemin ve kenarlıkla ayrılır. Nokta yerine geciken tarihte uyarı üçgeni, yakın tarihte saat, diğer tarihli kayıtlarda takvim, tarihsiz kayıtta kısa çizgi gösterilir. Tarihin üzerine gelince **Bugün teslim / 3 gün içinde teslim / Teslim tarihi geçti** açıklaması okunur. Aynı kural günlük liste, Genel bakış, haftalık hedefin bağlı işleri ve widget özetinde kullanılır. Tamamlanmış, iptal edilmiş veya aktarılmış işler ve tarihsiz kayıtlar nötrdür; yakın tarih uyarısı hedeflere uygulanmaz. Tarih rengi görünümden hesaplanır, kayıt veya geri alma adımı oluşturmaz.

## Proje ve iş türü

Günlük iş oluşturma formundaki eski **Kategori** alanı gösterilmez; saklanan değer korunur.

Yeni ve mevcut günlük iş formlarında **Proje kodu** ve **İş türü** girişi gösterilmez. Mevcut kayıtların eski değerleri, önceden verilmiş başlangıç bilgileri ve ayrı form taslakları korunur; ilgisiz bir düzenleme bu bilgileri sıfırlamaz. Eski değerler kayıt JSON yedeğinde taşınır ve genel aramada bulunur.

**Ayarlar** bölümündeki proje kodu ve iş türü listelerine seçenek eklenebilir, adları değiştirilebilir veya seçenekler listeden kaldırılabilir. Bunlar mevcut kayıtların değerlerini değiştirmez; kaldırılan seçenekler eski kayıtlardan yeniden önerilmez. Liste değişiklikleri **Geri al** ile geri alınır. Yeni JSON yedekleri bu listeleri de taşır; listeleri içeren bir yedeği yüklemek kayıtlarla birlikte tek adımda geri alınabilir. Yalnız kayıt içeren eski yedeği yüklemek mevcut listeleri korur.

Günlük işte dış yanıt, malzeme veya erişim bekleniyorsa **Durum → Beklemede** kullanılır. Ayrı engel kutusu ve engelli işler filtresi yoktur. Beklemede günlük işin başlığının yanındaki küçük **saat**, üzerine gelince veya klavyeyle odaklanınca bekleme nedenini gösterir; simgeye tıklamak doğrudan bekleme düzenleyicisini açar. Önizlemede iş adı tekrarlanmaz. Buradaki **Düzenle** veya durum menüsündeki **Bekleme bilgisi** de isteğe bağlı **Neyi/kimi bekliyorum?** alanını açar. Beklemede seçildikten sonra açılan düzenleme penceresinden vazgeçmek seçilmiş durumu geri almaz; durum ve ayrıntılar ayrı **Geri al** adımlarıdır. Başka duruma geçmek saklanan nedeni silmez.

Eski engel işaretli açık günlük işler ilk güncellemede **Beklemede** durumuna alınır; eski engel açıklaması, bekleme nedeni alanı boşsa bu alana taşınır. Kapalı işler yeniden açılmaz. Tarihler, kaynaklar ve eski alanlar yedekte korunur; dönüşüm tek **Geri al** adımıdır ve geri aldıktan sonra yeniden açmak aynı dönüşümü tekrarlamaz. Eski alanları içeren yedekler okunmaya devam eder. Bekleme durumu çalışma sayacını kendiliğinden başlatmaz veya durdurmaz.

Formdaki **Özgün kayıt bilgileri** bölümü kaldırılmıştır. Eski kategori ve ham kaynak alanları yedeklerde korunur. Excel aktarımının notlara eklediği, kaynak değeriyle birebir doğrulanabilen **Gün / Gecikme / Odak Sıra** satırları ilk güncellemede tek bir geri alma işlemiyle temizlenir. Gerçek Notlar/Açıklama metni ve belirsiz satırlar silinmez. Temizliği geri aldıktan sonra yeniden açmak işlemi tekrarlamaz; gerekirse Ayarlar'daki **Aktarım notlarını temizle** düğmesiyle tekrar uygulanabilir. Bu düğme yalnız temizlenebilecek eski satırlar varsa görünür.

### Anlık işler

Excel'deki **Günlük Pop-Up İşler** bir haftalık hedef yerine günlük iş bağlamı olarak ele alınır. İlk güncel açılışta bu başlığa bağlı günlük işler haftalık bağlantıdan ayrılıp **Anlık iş** grubuna taşınır; kategoriler, durumlar, tarihler, notlar ve çalışma geçmişi korunur. Eski haftalık satır silinmez; **Tümü → Durum → Arşivlenenler** altında **Arşivlendi** olarak tutulur. Eski hafta, hedef ve manuel ilerleme değerleri kaynak bilgilerinde saklanır. Gerçek haftalık hedeflerin bağlantıları değişmez.

Dönüşüm tek bir **Geri al** adımıdır. Bir defalık dönüşüm işareti `is-takip-v1-daily-context-migration` alanında tutulur; geri alma sonrası sayfa yenilenince aynı işlem yeniden uygulanmaz. Eski yedek geri yüklenirse veya dönüşüm geri alınırsa günlük listede **Anlık işlere taşı** seçeneği görünür. **Tüm işler / Planlı işler / Anlık işler** filtresi günlük iş listesini ayırır.

Yeni günlük iş, haftalık hedef bağlantısı verilmediyse **Anlık iş** olarak başlar. Formda haftalık hedef seçilince otomatik **Planlı iş** olur; bağlantı kaldırılınca **Anlık iş** olur. Haftalık hedefin içinden eklenen günlük iş, hedefi seçili ve planlı açılır. **Çalışma bağlamı** seçimi **Ek bilgiler** altında kalır; istenirse hedef bağlamadan da elle **Planlı iş** seçilebilir. Elle **Anlık iş** seçmek haftalık bağlantıyı kaldırır. Mevcut kayıtları açmak bağlamlarını kendiliğinden değiştirmez; bağlantı değişiklikleri kaydedilip geri alınabilir.

## Bekleyen konular ve takip

Bekleyen konularda öncelik alanı ve öncelik filtresi kullanılmaz. Mevcut kayıtların eski öncelik değerleri ilgisiz düzenlemelerde, yedekte ve geri almada korunur.

Bekleyen konu listesi **kimden beklendiğini, bekleme süresini, son takibi, sonraki takibi ve son gelişmeyi** ayrı gösterir. Düzenleme formunda **Kimden bekleniyor? / Son takip / Sonraki takip / Son gelişme** alanları başlık ve durumla birlikte ilk bölümde görünür. Açık konuda kimden beklendiği veya son gelişme eksikse **Beklemeyi netleştir** önerisi görünür; ikisi de tamamlanınca veya konu kapanınca o konu öneriden çıkar. Bekleyen konularda teslim tarihi alanı kullanılmaz; eski teslim tarihleri saklanır. Bekleme süresi, formdaki **Beklemeye başlama tarihi** ile bugün arasındaki takvim günü farkıdır; her gün yeniden hesaplanır ve **103 gün** gibi kısa gösterilir. Başlangıç tarihi üzerine gelince okunur; tarih bilinmiyorsa süre yerine çizgi gösterilir. Konu kapatıldığında kapanış günü kaydedilir ve toplam süre bu günde sabitlenir; yeniden açılınca canlı hesap sürer. Eski kapalı konunun kayıtlı sayısal süresi varsa ek kaynak açıklaması olmadan gösterilir; bu sayı tek başına kapanış tarihi oluşturmaz. Başlangıç veya kanıtlı süre yoksa çizgi görünür.

**Takip planla** veya mevcut sonraki takip tarihine tıklamak hatırlatma tarihini düzenler. Bu planlama son takip tarihini değiştirmez ve geçmişe görüşme kaydı eklemez. **Takip → Takip gerekenler / Bugün takip / 3 gün içinde / Bu hafta takip / Gecikenler / Takip planı yok** filtreleri sonraki takip tarihini esas alır. **Takip gerekenler**, sonraki tarihi bugün veya geçmişte olan açık konuları ve henüz takip planı olmayanları birlikte gösterir. Gecikmiş takip kırmızı, bugün ve üç gün içindeki takip turuncu gösterilir.

Kayıt formundaki **Son gelişme** metnini düzeltmek tarihli takip geçmişi oluşturmaz. Gerçekleşmiş görüşme veya hatırlatmayı **Takip ettim** ile kaydedin.

Kaydedilmiş takibi olan konunun başlığında küçük bir **takip geçmişi** simgesi görünür. Üzerine gelmek veya klavyeyle odaklanmak gerçek geçmişi gösterir; tıklamak aynı sayfada takip penceresinin geçmiş bölümünü açar. Takip ekleme ve geçmiş düzeltme alanlarında **Enter** kaydeder, **Shift+Enter** alt satıra geçer.

**Takip ettim**, gerçekleşen takibin tarihini, isteğe bağlı kısa sonucunu ve sonraki takip tarihini birlikte kaydeder. Tarih bugünden ileri olamaz. **Son takip** en yeni tarihi tutar; bu tarihteki dolu sonuç **Son gelişme** alanını günceller. Daha eski bir görüşmeyi sonradan eklemek bu alanları geriye götürmez. Sonuç boş bırakılırsa mevcut son gelişme korunur. Bu işlem konunun durumunu değiştirmez ve çalışma sayacı kullanmaz. Geçmişteki her kayıt **Düzenle** ile tarih, sonuç, sonraki takip tarihi ve varsa **Önceki son gelişme** metni üzerinden düzeltilebilir; aynı kayıt güncellenir, yeni görüşme eklenmez. Kapalı konunun geçmişi yeniden açılmadan düzenlenebilir; yeni takip eklemek için konu açık olmalıdır. Takip kaydı, sonucu ve planlanan tarihi tek **Geri al** adımıyla geri alınır ve JSON kayıt yedeğine dahildir. Geçmiş düzeltmesi de tek **Geri al** adımıdır. Tarih sırası yeniden hesaplanır; ayrıca elle düzeltilmiş güncel alanlar korunur.

Geçmişe kaydedilmemiş bir **Son gelişme**, yeni ve farklı bir takip sonucu tarafından değiştirilecekse eski metin aynı kayıtta **Önceki son gelişme** olarak korunur; ona görüşme tarihi uydurulmaz. Boş veya aynı sonuç eski metnin kopyasını eklemez. Daha önce kaybolmuş metinler kendiliğinden geri getirilemez.

Eski aktarımın **Kaç Gün Bekledi** satırı yalnız kaynak değeriyle doğrulanırsa notlardan temizlenir. Aynı şekilde doğrulanabilen **Son Durum**, boşsa **Son gelişme** alanına taşınır; gerçek **Not** metni ve kaynak bilgiler korunur. İlk güncellemedeki bu düzenleme geri alınabilir; yenilemek geri alınmış temizliği tekrarlamaz. Gerekirse **Ayarlar → Bekleyen konu notlarını düzenle** ile yeniden uygulanabilir.

## Çalışmaya başla

Günlük işin **▶ Çalışmaya başla** düğmesi sol altta o işe ait **Çalışma notu** alanını açar. Çalışırken bu alana yazabilirsiniz. Süre sayacı ve saat/dakika girişi yoktur. Notlar bağımsız **Notlar** kartından ayrıdır; her çalışma notu kendi işine ve çalışma kaydına aittir.

**Duraklat** sonuç istemez; yazılanları taslak olarak korur ve not alanını küçük özete indirir. **Notu aç** notu yeniden gösterir. **Devam et** aynı nottan sürdürür. Başka işe başlandığında önceki iş duraklatılır; geri dönüldüğünde taslağı açılır. Sayfa yenilendiğinde veya pencere kapandığında da kaydedilmiş taslak korunur. Kaydedilemeyen metin açık alanda tutulur ve hata gösterilir; yeniden denenebilir. Başka penceredeki notun üzerine sessizce yazılmaz.

Sol menüdeki sekmeler çalışma notu açıldığında da sabit kalır; menü kaydırılmaz ve başlıklar tek satırda gösterilir. Üst boşluklar ve not alanı ekran yüksekliğine göre sıkışır. Kartın alt satırında solda oksuz **Çalışma geçmişi**, sağda toplam kayıt sayısı bulunur.

**Bitir**, aynı alanda **Sonuç** adımını açar; notunuz hazır gelir. Sonuç yazmak isteğe bağlıdır. Alan boşken **Kaydet ve bitir** çalışmayı kapatır, geçmişe kayıt eklemez. Sonuç yazılmışsa tarih ve saat bilgisiyle kaydedilir. Vazgeçmek taslağı korur. Kaydetme başarısız olursa metin korunur; yeniden denemek aynı kaydı çoğaltmaz. Bitirmek günlük işin durumunu değiştirmez. Kaydedilmiş çalışma tek **Geri al** adımıyla geri alınabilir.

Sol alttaki **Çalışma geçmişi** haftalık geçmişi, günlük işin sağındaki geçmiş simgesi o işe ait kayıtları açar. Kayıtlar tarih ve sonuçla gösterilir; tarih ve sonuç düzenlenebilir, kayıt silinebilir. Eski boş sonuçlar, sonraki adımlar ve hassas süre değerleri kayıtta ve JSON yedeğinde korunur. Düzenleme ve silme tek **Geri al** adımıdır.

Tamamlanmış, iptal edilmiş veya aktarılmış işte yeni çalışma başlatılamaz. Kaydedilmemiş taslaklar bu tarayıcıdaki çalışma alanında kalır; JSON yedeğine, sonuç bitirilip kaydedildikten sonra dahil olur.

## Toplantı kararından işe ve takibe

Toplantı kaydında konu ve **Alınan karar** öndedir. Toplantı tarihi ve notlar **Ek bilgiler** altında kalır. **Sorumlu / Katılımcılar** girişleri kaldırıldı; toplantı kayıtlarındaki değerleri ve aynı alanların Excel kaynak kopyaları temizlenir. Bu temizlik tek işlemle geri alınabilir; yeniden açılış geri almayı tekrar uygulamayla bozmaz. Diğer kayıt türleri, kararlar, notlar, tarihler ve bağlantılar korunur. Toplantının ayrı öncelik, teslim tarihi veya sonraki adım alanı yoktur; eski değerler kayıtta ve yedekte korunur. Aynı aksiyondan **bir günlük iş** ve **bir bekleyen konu** açılabilir: **Ben yapacağım** somut işin kendi öncelik ve teslim tarihini; **Başkasından bekliyorum** beklenen sonucu, kimden beklendiğini, sonraki takip tarihini ve son gelişmeyi tutar. Son takip boş başlar; kayıt oluşturmak görüşme kaydı oluşturmaz. Yeni akışlar toplantının eski tarih, öncelik, sorumlu veya sonraki adımını kendiliğinden devralmaz.

Toplantı listesinde **Aksiyon / Karar, Durum, Bağlı iş, Takip, İşlem** sütunları vardır; üstte **Açık / Kapalı / Tümü** seçilir. Bağlı iş veya takip varsa toplantı durumu bunlardan hesaplanır: herhangi biri açıksa **Açık**, hepsi tamamlanmış veya iptal edilmişse **Kapandı**. Bu durumda toplantının durumu salt okunurdur; değişiklik ilgili iş veya takip üzerinden yapılır. Bağlantısız toplantıda **Planlanacak / Açık / Kapandı** kendi etiketinden veya kayıt formundan seçilir. Durum ve yönlendirme düğmeleri aynı ölçüde, sağ sütunlar içeriklerine göre kompakt ve sola hizalıdır. Toplantı satırında tamamlama kutusu kullanılmaz. Bağlı iş ve takip kendi durumlarını kendi sütununda gösterir. Öncelik/teslim tarihi sütunları ve filtreleri kullanılmaz. Her akışın düğmesi kendi kaydını toplantı sayfasının üzerinde açar; sayfadan ayrılmadan düzenlenir ve kapatınca aynı toplantıya dönülür. Güncel kararda akış yoksa **İş oluştur / Takip oluştur** formunu açar; arşivdeki bağlantısız satırda bu düğmeler gösterilmez. Kaydetmeden vazgeçmek kayıt oluşturmaz; aynı türde ikinci kopya oluşturulmaz. Tarih varsa gerçek bağlı kayıttan **İş teslimi / Sonraki takip** olarak kendi sütununda gösterilir. Bağlı **İş** ve **Takip** durumları ayrı rozetlerde gösterilir; her rozet yalnız kendi kaydının durum menüsünü açar. Bu menülerde **Tamamlandı / Kapandı** tekrarlanmaz; tamamlama ilgili kaydın kendi arayüzünden yapılır.

**Her ikisi de**, **Yapacağım iş** ve **Beklediğim sonuç** için iki ayrı bölüm içeren formu açar. İki bölümü **İki akışı kaydet** ile birlikte oluşturabilirsiniz. Bir akış zaten varsa o bölüm salt okunur gösterilir ve **Eksik akışı ekle** yalnız eksik olanı kaydeder; mevcut kayıt yeniden kullanılır ve üzerine yazılmaz. Eksik akışların kaydı tek atomik işlemdir. Formdan vazgeçmek değişiklik yapmaz; kaydetme tek **Geri al** adımıdır.

Günlük iş ve dış yanıt birbirinden bağımsız yönetilir; birini bitirmek diğerini kapatmaz. Toplantı durumu bağlı iş ve takibin ortak sonucunu gösterir. İş veya takip yeniden açılırsa toplantı da **Açık** görünür; kaynak toplantıyı kapatmak açık işleri gizleyemez. Toplantının eski tarih, öncelik, sorumlu ve sonraki adım değerleri korunur. Değişiklikler aynı kaydetme ve **Geri al** işlemindedir. Takvim ve mini ajanda gerçek iş teslimlerini ve bekleyen konuların takip tarihlerini kullanır; toplantının eski teslim tarihi burada tekrarlanmaz. **Takip gerekenler** yalnız sonraki takip tarihi yaklaşan bekleyen konuları gösterir.

Bekleyen konu için e-posta veya telefon gibi bir **günlük temas adımı** açılabilir. Bu işi bitirmek dış yanıtın geldiği anlamına gelmez; bekleyen konuyu kapatmaz ve konunun takibi devam eder. Bekleyen konunun kendi durumu ve takip tarihleri kendi kaydından yönetilir. Outlook bağlantısı bulunmaz.

## Kompakt Genel bakış

Üstteki **Planını netleştir** şeridi isteğe bağlı dört öneri sunar; yalnızca uygun kayıt bulunan düğmeler görünür:

- **Hedeflere adım planla**: Bu haftanın açık hedeflerinden sayısal hedefi ve uygun bağlı günlük işi olmayanlar.
- **Beklemeyi netleştir**: Beklemede olan günlük işlerden bekleme nedeni boş olanlar. Bu alan isteğe bağlıdır. Bekleyen konularda kimden beklendiği ve son gelişme eksikleri de burada görünür.
- **İşleri gözden geçir**: En az yedi takvim günüdür güncellenmeyen açık günlük işler. Üzerinde çalışılan iş dahil edilmez.
- **Kalan hedefleri planla**: Önceki hafta ve aylardan kalan açık hedefler; türü ve dönemi gösterilir. Haftalık hedefi bu haftaya, aylık hedefi bu aya taşıyabilirsiniz.

Her düğme ilgili kayıtları gösterir; buradan kaydı açıp karar verirsiniz. Arama bu önerileri de süzer. Sayılar birleştirilmez; şeridi açmak kayıt veya durum değiştirmez ve zorunlu bir işlem başlatmaz. Öneri yoksa şerit görünmez. Eski dört büyük gündem kartı kaldırılmıştır.

**Güncel işler** yalnızca açık günlük işleri gösterir; hedefler ve takip konuları bu listeye karıştırılmaz. **Açık işler / Bugün teslim / Geciken / Bugünün odağı** düğmeleri başlığın yanındadır. Bugün teslim yalnızca bugünkü teslimleri, Geciken geçmiş teslim tarihlerini süzer. Tamamlanan, iptal edilen ve devredilen günlük işler burada görünmez.

**Bugünün odağı** için işin yanındaki yıldızdan en fazla **3 açık günlük iş** seçebilirsiniz. Seçimler elle yapılır; sayacı başlatmak işi kendiliğinden odağa eklemez. Yıldız tekrar tıklanınca seçim kaldırılır. Bu planlama teslim tarihini, durumu veya hedef bağlantısını değiştirmez; seçim `focusDate` alanıyla JSON yedeğine girer ve **Geri al** ile geri alınır. Filtreyi açmak kayıt değiştirmez. Yeni gün başladığında önceki seçimler bugünün listesinde görünmez; eski tarihleri kayıtta korunur ve gün değişimi kayıt yazmaz.

**Bağlantıları gözden geçir**, kapalı veya artık bulunamayan haftalık hedefe bağlı açık planlı günlük işleri gösterir. Aynı adlı tek bir açık hedef varsa önerilir; her satırdaki hedefi kontrol edip uygulanacak işleri işaretleyin ve **Bağlantıları uygula** düğmesini kullanın. Pencereyi açmak veya öneriyi görmek bağlantı kurmaz. Yalnız işaretlenen kayıtların bağlantıları değişir; işlem tek adımda geri alınır. Durum, teslim tarihi ve çalışma geçmişi korunur.

Genel bakışta **Sırala** kontrolü yoktur. Sabit sıra **çalışan iş → geciken → bugün teslim → ileri tarihli → tarihsiz** şeklindedir. Aynı grupta öncelik, sonra yakın teslim tarihi belirler. Gerçekten çalışmakta olan satır hafif yeşille belirginleşir; duraklatınca bu vurgu kalkar. Yalnız **Devam ediyor** durumunda olmak çalışmanın başlatıldığı anlamına gelmez. Arama ve seçili filtre, çalışan işi de süzer. Eşleşen bütün işler doğrudan listelenir; altı iş sınırı ve genişletme düğmesi yoktur. Uzun liste kendi içinde kaydırılır. Altı tam liste ekranındaki sıralama ve 50 kayıtlık sayfalama korunur.

İş adı, durum, öncelik ve teslim tarihi masaüstünde ayrı sütunlardır; tamamlama solda, başlatma en sağdadır. Öncelik ve tarihe tıklamak hızlı düzenleyiciyi açar; kayıt formunu açmak gerekmez. Beklemede durumunun menüsünden bekleme nedeni ayrıca düzenlenebilir. Gerçek değişiklikler **Geri al** ile geri alınabilir.

Masaüstünde Genel bakış iki sıradan oluşur. Üstte **Güncel işler** ve **Takvim** aynı yükseklikte biter. Altta **Takip gerekenler**, haftalık hedefler ve bağımsız **Notlar** eşit genişlikte, aynı hizada üç paneldir. Takip kartlarında sayfa geçilir; bütün haftalık hedeflere **Haftalık plan** bağlantısıyla ulaşılır. Alt paneller boşken de ilgili listeye gitme bağlantısı görünür. Kısa/dar pencerelerde normal sayfa kaydırması korunur. Diğer altı liste ekranının sayfa akışı değişmez.

Sağ üstteki **Takvim**, pazartesi başlayan kompakt ay görünümüyle açık kayıtların gerçek tarihlerini gösterir. Günlük işler ve haftalık/aylık hedeflerde **teslim tarihi**, bekleyen konularda yalnız **sonraki takip tarihi** kullanılır. Toplantıların eski teslim tarihleri ve senelik hedefler takvimde gösterilmez; yalnız hafta/ay dönemi belirtilmiş hedefe tarih uydurulmaz. Kapalı kayıtlar gösterilmez; bağlı iş ve takipler kendi tarihlerinde görünür.

Bir gün seçince o günün kayıtları açılır. Ay gezinmesi, gün ızgarası, seçili gün başlığı ve ekleme kontrolü yerinde kalır; yalnız seçili günün kayıtları kendi alanında kaydırılır. **Büyüt** ile başlıkları gösteren **Ay / Hafta** görünümüne geçilebilir. Büyük ay görünümünde her günün ilk iki kaydı ve kalan kayıtların **+N** sayısı gösterilir; günü seçince bütün kayıtlarına ulaşılır. Mini veya genişletilmiş takvimden kayda tıklamak düzenleme formunu bulunduğunuz sayfanın üzerinde açar; arkadaki bölüm, arama, filtreler ve kaydırma konumu değişmez. Form kapatılınca aynı seçili gün ve görünümdeki takvime dönülür. Takvimden yeni **Günlük iş / Bekleyen konu** seçilebilir: seçili gün günlük işin teslim tarihine veya bekleyen konunun sonraki takip tarihine hazırlanır. Kayıt/açılış tarihi yeni kaydın açıldığı gündür. Kaydetmeden vazgeçmek kayıt oluşturmaz. Ayı, haftayı veya günü değiştirmek ve arama yapmak kayıtları değiştirmez; açık form yokken Escape genişletilmiş takvimi kapatır.

Üst çubuktaki **Takvim** düğmesi, Genel bakışta veya herhangi bir listede aynı takvimi açar. Bulunduğunuz bölümü, aramayı ve liste filtrelerini değiştirmez; Escape kapatınca klavye odağı düğmeye döner. Seçili gün ve görünüm korunur.

Büyük takvimde gün hücresinin boş alanına tıklamak da o günü seçer. Hücredeki bir kaydı açınca seçili gün kaydın bulunduğu tarihe geçer; düzenleyiciden dönünce aynı günün ajandası açık kalır.

Yeni bekleyen konuda **Son takip** boş başlar; kayıt açmak görüşme yapılmış gibi bir takip tarihi oluşturmaz.

Takvimin altındaki **Bu haftanın hedefleri**, güncel haftanın açık hedeflerini başlığı, durumu, değiştirilebilir teslim tarihi, ilerlemesi ve bağlı günlük iş sayısıyla gösterir; uzun liste kendi içinde kaydırılır. Bu haftada açık hedef yoksa en yakın gelecek haftanın açık hedefleri **Yaklaşan haftanın hedefleri** başlığı ve hafta tarihleriyle gösterilir. Aynı haftadaki bütün açık hedeflere bu listeden ulaşılabilir. Bu önizleme hedeflerin dönemini veya durumunu değiştirmez; **Haftalık plan** gösterilen haftayı açar. Karttaki **İlerleme** ve **Bağlı işler** düğmeleri mevcut ayrıntı panelinin ilgili bölümünü açar. Açmak kaydı değiştirmez; kaydedilmemiş hedef taslakları korunur. Sayısal hedef ilerlemesi ile bağlı işlerin tamamlanması ayrı anlam taşır; birleştirilip yeni bir yüzde uydurulmaz. Önceki haftaların açık hedefleri yalnız üstteki **Kalan hedefleri planla** önerisinde yer alır; sağ panelde sayıları tekrarlanmaz. Güncel veya yaklaşan hedef yoksa **Hedef seç** haftalık planı açar.

**Takip gerekenler** başlığında toplam kayıt sayısı, sayfa okları ve **Bekleyen konular →** bağlantısı bulunur. Takip ve hedef panelleri en fazla **iki kart** gösterir; dar ekranda kartlar alt alta gelir. Tek kayıt da bir kartlık yer kaplar. Birden fazla takip sayfası varsa gösterge **Sayfa 1 / 2** şeklindedir. Takip ve hedef kartındaki durum rozetine basmak ilgili kaydın durum menüsünü açar; değişiklik tek adımda geri alınır. Tarihe tıklamak sonraki takip planını düzenler, **Takip ettim** gerçekleşen takibi kaydeder. Tarih planlamak takip geçmişine giriş eklemez. Başlık veya gövdeden kayıt ayrıntısı açılır. Hedefte **İlerleme / Bağlı işler** ilgili bölümü açar; **Haftalık plan →** gösterilen haftaya gider. Sayfa ve görünüm işlemleri kayıtları değiştirmez. Uzun konu metni karttaki kullanılabilir üst alanı doldurur; durum/tarih ve alt eylemler aşağıda kalır. **Bekleme / Son takip** başlıkları ve altlarındaki kısa değerler iki sütundadır; **Takip ettim** altta tam genişlikte ve açık temada beyaz zeminlidir. Hedef kartında yalnız yüzde ve sayısal tamamlanan/toplam görünür; ölçüm birimi araç ipucunda okunur.

Takip kartlarında bekleyen konuların sonraki takip tarihleri esas alınır: **gecikenler, bugün ve sonraki üç takvim günü** dahil edilir. Toplantının eski teslim tarihi bu kartlara alınmaz. Geçerli tarihi olmayan, kapalı veya daha uzak gelecekteki kayıtlar bu alana girmez. Günlük temas işi bulunan bekleyen konu, dış yanıtı beklediği için kendi takip tarihiyle burada kalabilir. Arama kartları da süzer. Daha uzak tarihli kayıtlar takvimde görünmeye devam eder; takip sayfasını değiştirmek üstteki takvimi hareket ettirmez.

Genel bakış, uygulama içinde kompakt özet ekranıdır. Sağ üstteki **Widget** düğmesi, ana ekranı koruyarak **ayrı ve küçük bir Mini ajanda** açar. **Bugün / Yarın** sekmeleri, takvimde ilgili güne ait açık teslim ve sonraki takip kayıtlarını gösterir. **Gecikenler**, teslim veya takip tarihi bugünden önce olan açık kayıtları en eski tarihten başlayarak gösterir; her kaydın gerçek tarihi görünür. Seçili listenin bütün kayıtlarına içeride kaydırarak ulaşılır; başlık ve sekmeler yerinde kalır. Ajanda salt okunurdur: sekme değiştirmek kayıtları değiştirmez; bir başlığa tıklamak ana uygulamadaki kaydını açar, **ODAK’ı aç** ana pencereye döner. Ana uygulamadaki değişiklikler ve geri alma widget'a anında yansır.

Çalışılan günlük iş varsa widget'ın altında iş adı ve **Çalışıyor / Duraklatıldı** durumu görünür. Widget bu oturumu başlatmaz, devralmaz veya kaydetmez. Geçersiz, kapanmış veya iş günlüğüne kaydedilmiş oturum gösterilmez.

Windows paketinde başlığın yanındaki **Üstte tut** düğmesi widget'ı diğer pencerelerin üstünde tutar; tekrar basmak normal sıraya döndürür. Bu seçim yalnız açık widget içindir. Normal tarayıcı açılışında düğme kullanılamaz; açıklaması Windows paketini belirtir.

Hedef içerik alanı **380×420 CSS piksel**dir; açılır pencerenin genişlik/yüksekliği baştan bu ölçüyle verilir. Windows başlatıcısının yardımcısı hazırsa tarayıcı ayrıca boyutlandırmaz; yardımcı ölçüler sabitlenince dış boyutu bir kez düzeltir. Normal HTML açılışında tarayıcı bir kez düzeltme dener; bu işlemden önce fare veya klavye kullanılırsa deneme iptal edilir. Boyut değişikliğini yeniden tetikleyen bir döngü yoktur. Sonraki elle boyutlandırmalar ve açık widget yeniden kullanılırkenki boyut korunur. Aynı düğme açık widget'ı tekrar kullanır; ana ekranın adresi, bölümü, araması ve açık formu değişmez.

Widget, aynı HTML dosyasının `#widget` adresini kendi penceresinde açar ve kayıtları kendisi izler. Ana ekran yenilense veya kapansa da widget açık kalır; widget'ı kapatmak ana ekranı kapatmaz. HTML doğrudan normal tarayıcıda açıldıysa tarayıcı adres çubuğunu gösterebilir. Açılır pencere engellenirse uygulama bunu bildirir; mevcut pencereyi başka görünüme dönüştürmez.

## Windows'ta uygulama görünümü

`npm run export:desktop`, `.local/ODAK-Masaustu.zip` ve sürüm numaralı kopyasını üretir. İçinde beş dosya bulunur: **TAKIP.html**, **ODAK.cmd**, **ODAK-Widget.cmd**, **ODAK-Pencere.ps1** ve **KULLANIM.txt**. Windows'ta Chrome'un uygulama modu ile açılır; adres ve sekme çubuğu kullanılmaz. Chrome kurulu olmalıdır. Normal Windows başlık çubuğu, küçültme/büyütme/kapat düğmeleri kalır. Bu paket Windows'a kurulan bir EXE değildir; bilgisayar açılışında başlamayı ayarlamaz.

Önce mevcut uygulamada **Ayarlar → Yedekleme → Yedeği indir** ile güncel kayıt yedeğinizi alın. Açık ODAK ve widget pencerelerini kapatıp eski pencere yardımcısının kapanması için **6 saniye bekleyin**. ZIP içindekileri **mevcut TAKIP.html dosyanızın bulunduğu klasöre** koyun; yeni HTML aynı ad ve konumda eskisinin yerini alsın. Sonra:

- **ODAK.cmd** ana uygulamayı büyütülmüş açar; pencere ekranın kullanılabilir alanını kaplar, Windows başlık ve görev çubuğu kalır. Chrome önceki küçük boyutu hatırlarsa yalnızca yeni açılan ODAK ana penceresi büyütülür. Sonraki elle boyutlandırmalara müdahale edilmez.
- **ODAK-Widget.cmd** Mini ajandayı doğrudan açar; ana uygulama kapalıyken de çalışır. **Bugün / Yarın** sekmeleri aynı kayıt alanını salt okunur izler; başka penceredeki değişiklikler ve geri almalar yansır. Chrome eski büyük pencere boyutunu hatırlarsa Windows başlatıcısı yalnızca yeni açılan widget penceresinin içerik alanını, çerçevesini ve ekran ölçeğini ölçer; ölçüler sabitlenince dış boyutu bir kez düzeltir. Hedef **380×420 CSS piksel içerik alanıdır**; sonraki elle boyutlandırmalar korunur.
- Uygulama modunda sağ üstteki **Widget** de **ayrı küçük pencere** açar; ana ekranın yerine geçmez. Chrome uygulama penceresinden açılan bu çocuk pencere uygulama görünümünü kullanır. Tekrar tıklanınca, ana ekran arada yenilenmiş olsa bile açık widget bulunur ve yeniden kullanılır.
- Ajandada **ODAK’ı aç**, aynı HTML dosyası için açık bir ana pencere varsa onu kullanır; widget küçük ve açık kalır. Ana ekranın bulunduğu bölüm, arama ve açık form korunur. Bir kaydın başlığına tıklanırsa açık ana ekranda ilgili kayıt açılır; başka bir form açıksa önce o formun tamamlanması istenir.
- Açık ana ekran yoksa widget **ekranın kullanılabilir alanına göre yeni ve ayrı bir ana pencere** açar; widget'ın kendi adresi, boyutu ve görünümü korunur. Ana pencereden yanıt gecikse bile tarayıcıdaki etkin pencere kilidi veya güncel varlık kaydı, ikinci ana ekran açılmasını önler. Chrome pencereyi öne getirmeyi engellerse widget, ODAK'ın zaten açık olduğunu ve görev çubuğundan seçilebileceğini gösterir.

**ODAK-Pencere.ps1** dosyası HTML ve iki CMD ile aynı klasörde kalmalıdır. Başlatıcı, kullanıcı oturumu için tek bir gizli pencere yardımcısı çalıştırır. Bu yardımcı, araç çubuğundan açılan widget ve widget'tan açılan yeni ana ekran dahil yalnızca yeni ODAK pencerelerini ayarlar. Widget ölçüleri sabitlenince tek düzeltme yapar ve o pencerenin boyutlandırmasını bırakır; zaten açık pencerelere ve sonraki elle boyutlandırmalara dokunmaz. Son ODAK penceresi kapandıktan kısa süre sonra kapanır. Chrome'a süreç genelinde büyütme veya küçük pencere ölçüsü verilmez; böylece iki pencere türü birbirinin boyutunu devralmaz. Yardımcı eksikse veya başlatılamazsa ODAK yine açılır ve boyut ayarının uygulanamadığı bildirilir.

Başlatıcılar yeni bir Chrome veri klasörü/profili oluşturmaz; aynı Chrome profilinizi kullanın. Dosyayı başka klasöre taşımak veya başka profille açmak farklı kayıt alanı gösterebilir. Chrome bulunamazsa açık hata gösterilir; Edge'e otomatik geçilmez. `#widget` ve `#desktop` aynı HTML dosyasının görünümleridir; kayıt anahtarı değişmez. Windows başlatıcıları bu Linux ortamında çalıştırılamaz; HTML görünümleri ve pencere geçişleri Chromium ile doğrulanır.

Pencereler arası iletişim aynı HTML adresiyle sınırlı BroadcastChannel, geçici localStorage mesajları ve desteklendiğinde Web Locks ile yapılır. Ana ekran ve widget ayrı rollerle bulunur; birbirlerinin yerine geçmez. Kayıtlar, tercihler ve geri alma geçmişi bu iletişimde değiştirilmez. Yeni paketle devam ederken eski pencereleri kapatıp güncel dosyayla açın; eski sürüm açık pencere isteklerine yanıt veremez.

Yerel HTML paketlemesinde `.local/current-data.json` varsa güncel başlangıç verisi olarak kullanılır; yoksa ilk aktarım kopyası kullanılır. Güncel paketleme yedeği `.local/ODAK-guncel-kayit-yedegi.json` dosyasına yazılır; özgün aktarım dosyaları korunur. Yeni başlangıç verisi, tarayıcıda zaten bulunan kayıtların üzerine kendiliğinden yazılmaz.

0.17 için onaylanan kayıt düzenlemesinde **147 kayıt 92 kayda** indirildi: 55 eski hafta aktarım kopyası ve yer tutucu kaldırıldı. **66 tamamlanmış kayıt, 21 açık kayıt ve 4 kaydedilmiş çalışma oturumu** korundu. Gerçek farklı dönemlere ait **Mastar** işleri ayrı kayıtlar olarak bırakıldı; yalnız başlık benzerliğinden birleştirilmedi. İlk aktarım ve düzenleme öncesi yedekler korunur.

Mevcut tarayıcıya bu temizlenmiş listeyi uygulamak için önce **Ayarlar → Yedekleme → Yedeği indir** ile güncel yedeğinizi alın; ardından **Yedeği yükle** ile ayrıca verilen **ODAK-guncel-kayit-yedegi.json** dosyasını seçin ve kayıtları değiştirme onayını verin. HTML dosyasını güncellemek mevcut tarayıcı kayıtlarını 92 kayıtla değiştirmez. JSON geri yüklemesi **Geri al** ile önceki çalışma alanına döndürülebilir.

## Geri alma

Sağ üstteki **Geri al** düğmesi son kayıt işlemlerini adım adım geri alır; kısa yolu **Ctrl+Z** (Mac'te Cmd+Z). Yeni kayıt, düzenleme, tamamlama/durum değişikliği, satırdan öncelik/tarih değişikliği, hedef bağlantısı, iş günlüğü kaydı, kaydedilmiş oturum düzenleme/silme, konu takibi, kayıt silme, çalışma alanını sıfırlama, JSON yedek yükleme ve tema değişikliği kapsanır. Silinen hedef geri alındığında alt kayıt bağlantıları da geri gelir. Kimlikler ve özgün tarihler aynen korunur.

En fazla 30 son işlem tutulur; tarayıcı alanına göre eski adımlar budanabilir. Geçmiş sayfa yenilenince korunur. Metin kutularında ve açık formlarda kısayol tarayıcının normal metin geri almasını bozmaz; arama, gezinme, filtreleme ve pencere açma işlemleri kayıt geçmişine girmez. Yeni bir değişiklik geri alınmış adımların üzerine ilerler; yeniden yap düğmesi yoktur.

Kayıtlar, görünüm tercihi ve geri alma geçmişi aynı `is-takip-v1` anahtarında tek bir atomik yazıyla saklanır: `{version:1, records, odak:{version:1, preferences, history}}`. Eski kayıt dosyaları desteklenir; eski görünüm anahtarı uyumluluk kopyasıdır. Bu zarfı uygulama kayıtlarında atmayın. JSON yedekleri geçerli kayıtları ve varsa `choiceLists` proje/iş türü listelerini taşır; görünüm tercihlerini, silinmiş geçmiş kayıtlarını ve geri alma geçmişini dışa aktarmaz. Yalnız kayıt içeren eski bir yedek yüklenince mevcut listeler korunur. Yedek yükleme, kayıtlar ve aktarılan listeler için tek bir **Geri al** adımıdır. Başka bir pencere kayıtları değiştirmişse eski geçmiş o değişikliği ezemez; güncel kayıtlar yüklenir.

## Bir defalık eski liste aktarımı

TAKIP.xlsm'deki 147 kayıt başlangıç verisine dönüştürüldü. Excel işlemleri normal uygulama akışından çıkarıldı; Excel kütüphanesi tarayıcı paketine dahil edilmez. Eski dosya değiştirilmedi, makrolar çalıştırılmadı.

İlk aktarımın ham kopyası Git dışında `.local/imported-data.json` dosyasında korunur; güncel paketleme yukarıda açıklanan temizlenmiş veriyi kullanır. Paketin başlangıç verisi yalnızca tarayıcıda kayıt anahtarı yoksa yüklenir; mevcut kayıtların üzerine yazılmaz. İlk aktarımda dönemlere göre 30 günlük iş–haftalık hedef bağlantısı kuruldu. Yedi eşleşmeyen bağlantının özgün hedef metni korunur ve günlük işler sayfasında düzenlenebilir. Sayısal hedefler ve özgün kaynak bilgileri korunur; formül şablonları kayıt oluşturmaz.

İlk aktarımın geliştirme aracı `npm run import:local -- /dosya/yolu/TAKIP.xlsm` komutudur. Başlangıç dosyası zaten varsa üzerine yazmaz; normal kullanım için çalıştırılması gerekmez. Veri modeli ve aktarım aracı testleri gelecekteki bakım için depoda tutulur.

## Geliştirme

Node.js 22.12+ gerekir; bu ortamda Node.js 24 kullanılır. Mevcut `/workspace/is_takip` deposunu kullanın; bulut görevleri zaten izoledir, ayrıca Git worktree oluşturmayın.

```bash
cd /workspace/is_takip
npm ci
npm run dev -- --port 5173
```

Kaynak `index.html` doğrudan dosyadan çalıştırılmaz; Vite sunucusu kullanır. Kişisel veri uç noktası `/__local/initial-data` yalnızca geliştirme/önizleme sunucusunda bulunur. Bu sunucuyu kişisel geliştirme ortamıyla sınırlayın.

```bash
npm test           # Veri modeli ve bir defalık aktarımın doğruluğu
npm run test:e2e   # Formlar, kalıcılık, ayarlar, JSON yedeği ve mobil kontroller
npm run build     # Statik üretim çıktısı (kişisel verileri içermez)
npm run export:html # .local/TAKIP.html + ODAK-kayit-yedegi.json (aynı başlangıç kayıtları)
npm run export:desktop # Windows uygulama görünümü için HTML + başlatıcılar + ZIP
npm audit
```

Belirli bir düzeltilmiş yedeği paket başlangıç kaynağı olarak seçmek için `ODAK_EXPORT_DATA=.local/duzeltilmis-yedek.json npm run export:desktop` kullanılabilir. Bu seçenek varsayılan başlangıç dosyası yerine belirtilen yedeği okur.

Tarayıcı testleri bu ortamda `/usr/bin/chromium` kullanır; başka makinelerde Playwright Chromium kurulmalıdır. Testler kişisel başlangıç verisi yerine ayrı örnek kayıtlar kullanır.

`.local/TAKIP.html` kişisel başlangıç verilerini içerir; Git'e veya herkese açık dağıtıma eklemeyin. Normal `dist/` derlemesi `.local/` verilerini içermez. Bu yönetilen ortamın tarayıcısı `file://` gezinmesini sınırladığı için tek dosya doğrulaması, HTML içeriği değiştirilmeden geçici yerel HTTP sunucusunda yapılır.

Masaüstü genel bakışta takip ve hedeflerin iç kartları aynı genişlik ve yüksekliktedir; düğmeler alta hizalanır. Fazla hedef satırları kart boyunu değiştirmeden kendi listesinde kaydırılır.

Kayıt formundaki metin alanında **Enter** kaydeder; **Shift+Enter** alt satıra geçer. Mevcut doğrulamalar ve kaydetme hataları aynı şekilde uygulanır. Notu olan kaydın başlığındaki not defteri simgesi, **Notlar** metnini üzerine gelince veya klavyeyle odaklanınca gösterir. Tıklamak/dokunmak doğrudan **Notu düzenle** penceresini açar; yalnız not değişir ve tek adımda geri alınır. Değişmiş taslağı kapatmak onay ister; başka pencerede değişen notun üzerine sessizce yazılmaz. Boş not için simge eklenmez.

Genel bakışta takip panelinin altında kapsamı açıklayan kısa bir metin bulunur. Kartlar listedeki durum renklerini kullanır. Bekleme süresi “115 gündür bekliyor”, son gerçekleşen takip “Son takip: 3 Ağu” gibi okunur. Hedef kartının tarihi ve hedef panelindeki açık bağlı işin tarihi mevcut tarih penceresiyle değiştirilebilir; yalnız ilgili kaydın tarihi güncellenir ve tek adımda geri alınır. Bağlam parçaları görünür ayraçlarla ayrılır.

Kayıt düzenlemede hafta ve ay, yeni kayıttaki gibi yıl + hafta aralığı / ay adı seçimiyle belirlenir. Dönem seçilmedikçe eski veya boş dönem metni korunur. Günlük işin bağlı hedef simgesi listede ve Genel bakışta başlık yanındadır. Duraklatılmış işin sağ düğmesi amber daire içinde oynat simgesiyle ayırt edilir. Çalışma kaydında tarih ve sonuç düzeltilebilir; eski ham süre değiştirilmez. Kart listesine tıklamak tüm paneli yeşil çerçeveyle çizmez.

Genel bakıştaki takip ve hedef kartlarının gövdesi ayrıntıyı açar. Takip ayrıntısı kimden beklendiğini, son gelişmeyi, tarihleri ve geçmişi salt okunur gösterir; Kaydı düzenle mevcut formu açar. Hedef gövdesi paneli üstten, İlerleme / Bağlı işler düğmeleri ilgili bölümden açar. Tarih ve Takip ettim düğmeleri kendi işlemlerini yapar. Kartı açmak veya metin seçmek kayıt oluşturmaz/değiştirmez; klavyede kart odağındayken Enter/Space desteklenir.

Toplantı ve bekleyen konu satırı/başlığı sağdaki ayrıntı panelini açar. Sağ uçtaki kalem ilk kayıt formunu açar; bekleyen konunun Takip ettim ve günlük iş oluştur düğmeleri ayrı kalır. Panelin Kaydı düzenle veya takip işlemi modalı üstte açılır; kapatınca aynı konu, kaydırma ve panel işlemi korunur. Listede fareyle açıp kapatılan satır yeşil dolgu bırakmaz; klavye odağı görünür kalır.

Güncel işler satırında Çalışmaya başla düğmesinin solundaki iş günlüğü simgesi, o işin kaydedilmiş oturumlarını açar. Kaydı olan simge lila, boş günlük nötrdür.

Not önizlemesi hedef bağlantısı balonu gibi doğrudan metni gösterir; ayrı Not başlığı, kapatma düğmesi ve iç çerçeve bulunmaz. Uzun notlar kaydırılabilir; klavyeyle metin alanına geçilebilir. Not simgesine tıklamak aynı not düzenleyicisini açar. Takip geçmişinin başlıklı önizlemesi korunur.

Bağlantı simgesiyle açılan panel kapanınca küçük balon yeniden kendiliğinden açılmaz; yeni fare girişi veya klavye gezinmesiyle açılır. Pencere kapanınca geri dönen kayıt başlığı altı çizili kalmaz; yeni klavye gezinmesinde odak görünürdür. Not düzenleyicisi kapandıktan veya kaydedildikten sonra not balonu yeni fare girişi ya da klavye gezinmesine kadar kapalı kalır. Form alanlarında kalın dış odak halkası yerine alanın kendi ince kenarlığı kullanılır.

İşlem sütunları düğme sayısına göre kompakt kalır; başlık ve düğmeler sola, aynı iç boşluklarla hizalanır. Bekleyen konunun yeni günlük iş oluşturma simgesi + işaretidir; mevcut bağlı işi açma simgesi ayrı kalır. Sağ panelde Takip ettim, Takip geçmişi başlığının yanındadır; alt çubukta Kaydı düzenle ve Kapat bulunur.

Hedef panelindeki bağlı kaydın Bağı kaldır simgesi yalnız o ilişkiyi çözer. Günlük iş anlık işe döner; alt hedef kendi türünde kalır. Durum, tarih, not, kaynak bağlantısı ve iş günlüğü korunur. İşlem tek adımda geri alınır ve panel açık kalır.

Bekleme bilgisi simgesi günlük işin başlığından sonra, bağlantı ve not simgeleriyle aynı gruptadır. Önizleme yalnız bekleme nedenini aynı kompakt balon biçiminde gösterir; simgeye tıklamak bekleme düzenleyicisini açar. Düzenleyici kapanınca balon kendiliğinden yeniden açılmaz. Hedefi taşı formunda mevcut hedef adı etiketlidir; Taşıma notu alanında açıklama ve örnek bulunur.

Notu düzenle penceresinde Enter notu kaydeder; Shift+Enter yeni satır ekler. Kısayol, düğmeyle aynı doğrulama ve eşzamanlı değişiklik kontrolünü kullanır.

Takip kartlarında yalnız tarih, takip sonucu ve sonraki takip tarihi gösterilir. Önceki gelişme bilgisi kartlara eklenmez; kayıtlı geçmiş verileri yedekte korunur. Bekleme süreleri ek aktarım açıklaması olmadan gösterilir.

Ayarlar’daki eski Listeler bölümü ve buna ait yardım metni kaldırıldı. Tarihsel proje kodu, iş türü ve liste tercihleri yedeklerde korunur. Bekleme bilgisi penceresinde de Enter kaydeder, Shift+Enter alt satır ekler.

Genel bakışın alt satırında Takip gerekenler ve haftanın hedefleri ikişer kart gösterir. Takip sayfaları diğer konulara, Haftalık plan bağlantısı tüm hedeflere açılır. Yanlarındaki Notlar alanı iş ve hedeflerden bağımsız maddeler tutar; not ekleme, düzenleme ve silme tek Geri al adımıdır. Not silme ek onay istemeden gerçekleşir; yanlışlıkla silinen not Geri al ile döner. Enter kaydeder, Shift+Enter alt satır ekler. Notlar JSON yedeğine dahildir; not içermeyen eski kayıt yedeği mevcut notları korur.

Çalışma alanını sıfırlama onayı, **Sıfırla** düğmesinin yakınında uygulamanın kendi küçük penceresinde açılır. Pencere ekranın içinde kalır; Vazgeç, çarpı, Escape veya dışına tıklamak kayıtları değiştirmez. Sıfırlama ayrıca onaylanır ve tek **Geri al** adımıyla geri döner.

Genel bakışın üç alt paneli önceki kompakt yüksekliğe döndü (masaüstünde 220 px, kısa pencerede 210 px). İş listesi ilk sütunu İş / Hedef olarak adlandırılır.

Takip kartlarındaki konu metni, durum ve tarih satırının üstündeki boşluğu kullanır. Kartın yüksekliği artmadan daha fazla satır okunabilir; Bekleme, Son takip ve Takip ettim alt bölümde kalır.

Haftalık hedef kartındaki durum ve teslim tarihi de takip kartlarıyla aynı alt hizadadır. İlerleme ve düğmeler yerinde kalır; panel yüksekliği artmaz.

Takip kartında Bekleme solda, Son takip başlığı ve tarihi sağ kenara hizalıdır.

Takip kartının altında iki yazılı işlem vardır: **Takip ettim** ve bağlı günlük iş sayısını gösteren **Bağlı işler**. Bağlı işler, bekleyen konu panelindeki ilgili bölümü açar. Burada günlük işler hedef panelindekiyle aynı kompakt düzende listelenir; yeni adım oluşturulabilir, mevcut açık iş bağlanabilir veya yalnız kaynak bağlantısı kaldırılabilir. Bir bekleyen konuya birden fazla günlük iş bağlanabilir; işin hedef bağlantısı, durum, tarihler, notlar ve iş günlüğü korunur. Bağlama ve ayırma tek **Geri al** adımıdır. Günlük işlerin tamamlanması bekleyen konuyu kendiliğinden kapatmaz. Toplantılardaki her tür için tek akış kuralı korunur.

Yeni kayıt ve düzenleme formlarında **Ek bilgiler** kapalı başlar. Haftalık ve aylık hedeflerin **Teslim tarihi** ana bölümde, dönem bilgisinin ardından görünür. Düzenleme ekranında da **Adetle takip et**, **Hedef adet**, **Birim** ve ek bilgilerde **Mevcut adet** bulunur. Ölçümü kapatıp kaydetmek sayısal ölçümü kaldırır; açıp kapatmak taslaktaki sayıları silmez. Değişmemiş kayıt formunu kaydetmek kayıt veya geçmiş oluşturmaz.

Genel **Yeni kayıt** üzerinden farklı bir listeye kayıt eklendiğinde o liste ve varsa seçilen hedef dönemi açılır. Takvim, hedef veya bekleyen konu içinden oluşturulan adımlar, açık panel ve takvim bağlamına döner. Mevcut kayıt bağlama alanı aday yokken de görünür; uygun aday bulunamadığı belirtilir.
