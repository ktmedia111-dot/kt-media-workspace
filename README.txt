KT MEDIA WORKSPACE - DÜZELTİLMİŞ DOSYALAR

GitHub deposundaki aynı adlı dosyaların yerine bu pakettekileri yükleyin:
- index.html
- styles.css
- app.js
- supabase-config.js

Yapılan uyum düzeltmeleri:
- Formdaki tarih alanı work_date olarak eşitlendi (Supabase jobs tablosundaki sütun).
- app.js zaten work_date kullanıyordu; shoot_date aramanızın sonuç vermemesi normal.
- assigned_to alanı iş kaydı eklenirken kaydedilecek şekilde eklendi.
- CSS sınıfları app.js'in kullandığı sınıf adlarıyla eşleştirildi.

ÖNEMLİ:
Bu sürüm mevcut temel giriş, iş ekleme, takvim, durum ve ekip onay akışını içerir.
Finans ekranı hâlâ yer tutucudur; PDF raporu ve tam kapsamlı finans/maaş modülü bu pakette tamamlanmış değildir.
Yönetici/ekip verilerinin güvenliği yalnızca arayüzde gizlemeyle sağlanmaz. Supabase RLS politikalarını ayrıca test edin.
Publishable key tarayıcıda kullanılabilir; service_role/secret key'i asla GitHub'a koymayın.
Mevcut Supabase tablolarını silmeyin.
