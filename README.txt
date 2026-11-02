KT MEDIA WORKSPACE — KURULUM

Bu paket, onaylanan açık renkli KT Media tasarımının ilk çalışan arayüz sürümüdür.
GitHub Pages + Supabase mimarisi için hazırlanmıştır. Finans ekranı yöneticiye özeldir.

1) ZIP'i bilgisayarınıza indirin ve klasöre çıkarın.
2) supabase-config.js dosyasını bir metin editörüyle açın.
3) Supabase Dashboard > Project Settings > API Keys bölümünden:
   - Project URL (veya Data API URL'nin kök proje adresi)
   - Publishable key
   değerlerini girin.
   Örnek:
   url: "https://PROJE_ID.supabase.co"
   publishableKey: "sb_publishable_..."
   SECRET / service_role anahtarını kesinlikle kullanmayın.
4) Dosyaların tamamını GitHub deposunun kök dizinine yükleyin.
5) GitHub > Settings > Pages > Deploy from a branch > main > /(root) > Save.
6) Yayınlanan site adresini Supabase > Authentication > URL Configuration:
   Site URL ve Redirect URLs alanlarına ekleyin.

MEVCUT SUPABASE PROJESİ HAKKINDA
- Proje ID: rxqndfcscmzaexbcpdvm
- Proje URL: https://rxqndfcscmzaexbcpdvm.supabase.co
- Region: eu-central-1
- Mevcut tablolar: profiles, jobs, finance_entries
- profiles tablosunda görülen alanlar: id, display_name, role, created_at, approved
- Admin profili: Kaan Turan / role=admin / approved=true

ÖNEMLİ VERİTABANI NOTU
Mevcut jobs ve finance_entries tablolarının kolonları bu pakete aktarılmadı/doğrulanmadı.
Uygulamanın çekim işleri ekranı jobs tablosunda şu alanları bekler:
title, job_type, shoot_date, location, assigned_to, status, notes, created_by.
Eğer mevcut jobs tablonuzda bu alanlar yoksa, tabloyu silmeyin. Önce Supabase Table Editor'da mevcut kolonları kontrol edin ve eksik alanları kontrollü biçimde ekleyin.
Önerilen alan tipleri:
title text, job_type text, shoot_date date, location text, assigned_to text,
status text default 'Planlandı', notes text, created_by uuid.
Finance ekranı şimdilik güvenli yer tutucudur; finans tablo kolonları teyit edilmeden veri yazmaz.

GÜVENLİK
- Publishable key tarayıcıda kullanılabilir; ancak bunun güvenli olması için RLS politikaları doğru olmalıdır.
- Secret/service_role anahtarını asla HTML/JS dosyalarına koymayın.
- Mevcut RLS politikalarını körlemesine silmeyin veya yeniden çalıştırmayın.
- Yeni ekip kayıtları profiles.approved=false ile bekler. Yönetici Supabase Table Editor'dan onaylayınca giriş yapabilir.
- Sadece role=admin ve approved=true olan kullanıcıya Finans menüsü gösterilir.
- Bu arayüzün finans menüsünü gizlemesi tek başına veri güvenliği değildir. finance_entries tablosunda admin-only RLS politikası ayrıca doğrulanmalıdır.

SINIRLAR
- Bu ilk sürüm, mevcut Supabase şemanızın tüm kolonları doğrulanmadan tam üretim sürümü sayılmaz.
- PDF raporları, dosya yükleme/depolama ve detaylı finans CRUD akışları sonraki entegrasyon adımında tamamlanmalıdır.
- Takvim şimdilik tarihli iş listesidir; tam aylık sürükle-bırak takvim değildir.
- Supabase ve CDN erişimi için internet bağlantısı gerekir.
