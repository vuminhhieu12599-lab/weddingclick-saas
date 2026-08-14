"use client";

import { useState, useEffect } from "react";
import imageCompression from 'browser-image-compression';
import { supabase } from "../../lib/supabase";

export default function WeddingAdmin() {
  const [loading, setLoading] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  const [formData, setFormData] = useState({
    id: "", couple_id: "", invitation_type: "CHUNG", template_id: "theme_traditional_red",
    groom_name: "", bride_name: "", groom_father: "", groom_mother: "", bride_father: "", bride_mother: "",
    wedding_time: "", wedding_date: "", lunar_date: "", location_name: "", wedding_address: "", map_link: "",
    audio_url: "", bank_name: "", bank_owner: "", bank_account: "", bank_qr: ""
  });

  // ĐÃ THÊM: show_effect
  const [settings, setSettings] = useState({
    show_music: true, show_countdown: true, show_album: true, show_rsvp: true, show_gift: true, show_effect: true
  });

  const [coverPhoto, setCoverPhoto] = useState<string>("");
  const [trioPhotos, setTrioPhotos] = useState<string[]>([]);
  const [albumPhotos, setAlbumPhotos] = useState<string[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("id");

    if (editId) {
      setIsEditMode(true);
      const fetchOldData = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('invitations').select('*').eq('id', editId).single();
        
        if (data && !error) {
          setFormData({
            id: data.id || "", couple_id: data.couple_id || "", invitation_type: data.invitation_type || "CHUNG", 
            template_id: data.template_id || "theme_traditional_red", groom_name: data.groom_name || "", 
            bride_name: data.bride_name || "", groom_father: data.groom_father || "", groom_mother: data.groom_mother || "", 
            bride_father: data.bride_father || "", bride_mother: data.bride_mother || "", wedding_time: data.wedding_time || "", 
            wedding_date: data.wedding_date || "", lunar_date: data.lunar_date || "", location_name: data.location_name || "", 
            wedding_address: data.wedding_address || "", map_link: data.map_link || "", audio_url: data.audio_url || "", 
            bank_name: data.bank_name || "", bank_owner: data.bank_owner || "", bank_account: data.bank_account || "", bank_qr: data.bank_qr || ""
          });
          if (data.settings) setSettings({ ...settings, ...data.settings }); // Giữ lại cấu hình cũ
          if (data.cover_photo) setCoverPhoto(data.cover_photo);
          if (data.trio_photos) setTrioPhotos(data.trio_photos.split(',').filter((p: string) => p.trim() !== ""));
          if (data.wedding_photos) setAlbumPhotos(data.wedding_photos.split(',').filter((p: string) => p.trim() !== ""));
        }
        setLoading(false);
      };
      fetchOldData();
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleToggle = (key: keyof typeof settings) => {
    setSettings({ ...settings, [key]: !settings[key] });
  };

  const removePhoto = (type: 'cover' | 'trio' | 'album' | 'qr', index?: number) => {
    if (type === 'cover') setCoverPhoto("");
    if (type === 'qr') setFormData({ ...formData, bank_qr: "" });
    if (type === 'trio' && index !== undefined) setTrioPhotos(trioPhotos.filter((_, i) => i !== index));
    if (type === 'album' && index !== undefined) setAlbumPhotos(albumPhotos.filter((_, i) => i !== index));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'cover' | 'trio' | 'album' | 'qr') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingType(type);
    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const options = { maxSizeMB: 0.3, maxWidthOrHeight: 1200, useWebWorker: true };
        const compressedFile = await imageCompression(file, options);
        
        const fileExt = file.name.split('.').pop() || 'jpg';
        const randomStr = Math.random().toString(36).substring(2, 8);
        const fileName = `${Date.now()}-${randomStr}.${fileExt}`;
        
        const { error } = await supabase.storage.from('wedding-photos').upload(fileName, compressedFile);
        if (error) throw error;
        const { data: publicUrlData } = supabase.storage.from('wedding-photos').getPublicUrl(fileName);
        uploadedUrls.push(publicUrlData.publicUrl);
      }
      if (type === 'cover') setCoverPhoto(uploadedUrls[0]);
      if (type === 'qr') setFormData({ ...formData, bank_qr: uploadedUrls[0] });
      if (type === 'trio') setTrioPhotos([...trioPhotos, ...uploadedUrls].slice(0, 3));
      if (type === 'album') setAlbumPhotos([...albumPhotos, ...uploadedUrls]);
    } catch (error: any) {
      alert("Lỗi tải ảnh! Hãy kiểm tra lại file hoặc mạng của bạn.");
    } finally {
      setUploadingType(null);
      e.target.value = ''; 
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingType('audio');
    try {
      const fileExt = file.name.split('.').pop() || 'mp3';
      const randomStr = Math.random().toString(36).substring(2, 8);
      const fileName = `audio-${Date.now()}-${randomStr}.${fileExt}`;
      
      const { error } = await supabase.storage.from('wedding-photos').upload(fileName, file);
      if (error) throw error;

      const { data: publicUrlData } = supabase.storage.from('wedding-photos').getPublicUrl(fileName);
      setFormData({ ...formData, audio_url: publicUrlData.publicUrl });
      alert("Tải nhạc lên thành công!");
    } catch (error: any) {
      alert("Lỗi tải nhạc! Vui lòng thử lại.");
    } finally {
      setUploadingType(null);
      e.target.value = ''; 
    }
  };

  const handleSave = async () => {
    if (!formData.id || !formData.couple_id) {
      alert("Vui lòng nhập Link thiệp (ID) và Mã cặp đôi!"); return;
    }
    setLoading(true);
    const payload = { ...formData, settings, cover_photo: coverPhoto, trio_photos: trioPhotos.join(','), wedding_photos: albumPhotos.join(',') };
    const { error } = await supabase.from('invitations').upsert(payload);
    setLoading(false);
    
    if (error) {
      alert("Lỗi khi lưu: " + error.message);
    } else {
      alert("🎉 Đã lưu cấu hình thiệp thành công!");
      // ĐÃ SỬA: Luôn luôn quay về Dashboard sau khi tắt thông báo
      window.location.href = "/dashboard";
    }
  };

  if (loading && isEditMode) return <div className="min-h-screen flex items-center justify-center font-bold text-gray-500">Đang tải dữ liệu thiệp cũ...</div>;

  return (
    <div className="min-h-screen bg-[#F3F4F6] p-4 md:p-8 font-sans pb-24">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="bg-white px-8 py-6 rounded-2xl shadow-sm border border-gray-100 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{isEditMode ? "Chỉnh Sửa Thiệp Cưới" : "Tạo Thiệp Mới"}</h1>
            <p className="text-sm text-gray-500 mt-1">Hệ thống tạo & chỉnh sửa thiệp tự động</p>
          </div>
          <button onClick={handleSave} disabled={loading} className="bg-[#9B1B1B] text-white px-8 py-3 rounded-lg font-bold hover:bg-red-800 transition shadow-md flex items-center gap-2">
            {loading ? "⏳ Đang lưu..." : (isEditMode ? "💾 Cập Nhật Thiệp" : "💾 Lưu Thiệp Mới")}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            
            {/* 1. ĐỊNH DANH */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-800 border-b pb-3 mb-4">1. Định danh Thiệp (Quan trọng)</h2>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Đường Link Thiệp (ID) *</label><input name="id" value={formData.id} onChange={handleChange} readOnly={isEditMode} className={`w-full border p-2.5 rounded-lg ${isEditMode ? 'bg-gray-100 text-gray-500' : ''}`} required /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Mã Nhóm Vợ/Chồng *</label><input name="couple_id" value={formData.couple_id} onChange={handleChange} className="w-full border p-2.5 rounded-lg" required /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Loại Thiệp</label><select name="invitation_type" value={formData.invitation_type} onChange={handleChange} className="w-full border p-2.5 rounded-lg"><option value="CHUNG">Thiệp Chung / Báo Hỷ</option><option value="NHA_TRAI">Thiệp Nhà Trai (Lễ Thành Hôn)</option><option value="NHA_GAI">Thiệp Nhà Gái (Lễ Vu Quy)</option></select></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Mẫu Giao Diện (Theme)</label><select name="template_id" value={formData.template_id} onChange={handleChange} className="w-full border p-2.5 rounded-lg"><option value="theme_traditional_red">Truyền Thống - Đỏ</option></select></div>
              </div>
            </div>

            {/* 2. VĂN BẢN */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="font-bold text-gray-800 border-b pb-3 mb-4">2. Nội dung Văn bản</h2>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Tên Chú Rể</label><input name="groom_name" value={formData.groom_name} onChange={handleChange} className="w-full border p-2.5 rounded-lg" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Tên Cô Dâu</label><input name="bride_name" value={formData.bride_name} onChange={handleChange} className="w-full border p-2.5 rounded-lg" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Bố / Mẹ Chú Rể</label><input name="groom_father" value={formData.groom_father} onChange={handleChange} className="w-full border p-2.5 rounded-lg mb-2" /><input name="groom_mother" value={formData.groom_mother} onChange={handleChange} className="w-full border p-2.5 rounded-lg" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Bố / Mẹ Cô Dâu</label><input name="bride_father" value={formData.bride_father} onChange={handleChange} className="w-full border p-2.5 rounded-lg mb-2" /><input name="bride_mother" value={formData.bride_mother} onChange={handleChange} className="w-full border p-2.5 rounded-lg" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Giờ đãi tiệc</label><input name="wedding_time" value={formData.wedding_time} onChange={handleChange} placeholder="VD: 10h30" className="w-full border p-2.5 rounded-lg" /></div>
                <div><label className="block text-xs font-semibold text-gray-500 mb-1">Ngày Dương Lịch</label><input name="wedding_date" value={formData.wedding_date} onChange={handleChange} placeholder="VD: 10.10.2026" className="w-full border p-2.5 rounded-lg" /></div>
                <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 mb-1">Ngày Âm Lịch</label><input name="lunar_date" value={formData.lunar_date} onChange={handleChange} placeholder="VD: Tức ngày 10 tháng 9 năm Bính Ngọ" className="w-full border p-2.5 rounded-lg" /></div>
                <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 mb-1">Địa điểm & Link Google Maps</label><input name="location_name" value={formData.location_name} onChange={handleChange} placeholder="Tên nhà hàng / Tư gia..." className="w-full border p-2.5 rounded-lg mb-2" /><input name="map_link" value={formData.map_link} onChange={handleChange} placeholder="Link Google Maps..." className="w-full border p-2.5 rounded-lg" /></div>
              </div>
            </div>

            {/* 3. ẢNH */}
            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
              <h2 className="font-bold text-blue-800 border-b border-blue-200 pb-3 mb-4">3. Quản lý Hình Ảnh (Tự động nén)</h2>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between mb-2"><label className="block text-sm font-semibold text-gray-700">📸 Ảnh Bìa Chính</label>{uploadingType === 'cover' && <span className="text-xs text-blue-600 animate-pulse">Đang nén & tải lên...</span>}</div>
                  {!coverPhoto ? <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'cover')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer" /> : <div className="relative inline-block mt-2"><img src={coverPhoto} className="h-40 rounded border shadow-sm object-cover" /><button onClick={() => removePhoto('cover')} className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full text-xs font-bold shadow-md hover:bg-red-700">&times;</button></div>}
                </div>
                <div className="pt-4 border-t border-blue-200">
                  <div className="flex justify-between mb-2"><label className="block text-sm font-semibold text-gray-700">📸 Bộ 3 Ảnh Thư Mời ({trioPhotos.length}/3)</label>{uploadingType === 'trio' && <span className="text-xs text-blue-600 animate-pulse">Đang nén...</span>}</div>
                  {trioPhotos.length < 3 ? <input type="file" accept="image/*" multiple onChange={(e) => handleImageUpload(e, 'trio')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer" /> : <p className="text-xs text-green-600 font-bold bg-green-100 inline-block px-3 py-1 rounded-full">✅ Đã đủ 3 ảnh</p>}
                  <div className="flex gap-4 mt-3">{trioPhotos.map((url, i) => <div key={i} className="relative inline-block"><img src={url} className="h-24 w-24 rounded border shadow-sm object-cover" /><button onClick={() => removePhoto('trio', i)} className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full text-xs font-bold shadow-md hover:bg-red-700">&times;</button></div>)}</div>
                </div>
                <div className="pt-4 border-t border-blue-200">
                  <div className="flex justify-between mb-2"><label className="block text-sm font-semibold text-gray-700">📸 Album Ảnh Thả Ga ({albumPhotos.length} ảnh)</label>{uploadingType === 'album' && <span className="text-xs text-blue-600 animate-pulse">Đang nén...</span>}</div>
                  <input type="file" accept="image/*" multiple onChange={(e) => handleImageUpload(e, 'album')} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer" />
                  <div className="flex gap-3 mt-3 flex-wrap">{albumPhotos.map((url, i) => <div key={i} className="relative inline-block"><img src={url} className="h-16 w-16 rounded border shadow-sm object-cover" /><button onClick={() => removePhoto('album', i)} className="absolute -top-1 -right-1 bg-red-500 text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold shadow-md hover:bg-red-700">&times;</button></div>)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: TÙY CHỈNH */}
          <div className="space-y-6">
            <div className="bg-[#FDFBF7] p-6 rounded-2xl border-2 border-[#E5C158]/50 shadow-sm sticky top-6">
              <h2 className="font-bold text-[#9B1B1B] border-b border-[#E5C158]/30 pb-3 mb-5">Tùy chỉnh Tính Năng</h2>
              <div className="space-y-5 mb-6">
                {[
                  { key: "show_music", label: "🎵 Phát Nhạc Nền" },
                  { key: "show_countdown", label: "⏱️ Đếm Ngược Ngày" },
                  { key: "show_album", label: "🖼️ Hiện Album Ảnh" },
                  { key: "show_rsvp", label: "✉️ Form Lời Chúc" },
                  { key: "show_gift", label: "🎁 Hộp thoại Mừng Quà" },
                  { key: "show_effect", label: "💖 Hiệu ứng Trái tim rơi" }, // ĐÃ THÊM CÔNG TẮC
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                    <button onClick={() => handleToggle(item.key as keyof typeof settings)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings[item.key as keyof typeof settings] ? 'bg-green-500' : 'bg-gray-300'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings[item.key as keyof typeof settings] ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                  </div>
                ))}
              </div>

              {settings.show_music && (
                <div className="p-4 bg-white rounded-xl border border-gray-200 space-y-3 mb-6">
                  <h3 className="text-xs font-bold text-gray-600 uppercase">Tải File Nhạc (MP3)</h3>
                  <input type="file" accept="audio/*" onChange={handleAudioUpload} className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-gray-100 cursor-pointer" />
                  {uploadingType === 'audio' && <p className="text-xs text-blue-500 animate-pulse">Đang tải nhạc lên...</p>}
                  {formData.audio_url && (
                    <div className="mt-2">
                      <audio src={formData.audio_url} controls className="w-full h-8" />
                      <button onClick={() => setFormData({...formData, audio_url: ""})} className="text-xs text-red-500 mt-2 font-bold hover:underline">Thùng rác (Xóa nhạc)</button>
                    </div>
                  )}
                </div>
              )}

              {settings.show_gift && (
                <div className="p-4 bg-white rounded-xl border border-gray-200 space-y-3">
                  <h3 className="text-xs font-bold text-gray-600 uppercase">Thông tin Bank / QR</h3>
                  {!formData.bank_qr ? <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 'qr')} className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-gray-100 cursor-pointer" /> : <div className="relative inline-block w-full text-center"><img src={formData.bank_qr} className="h-24 mx-auto rounded border" /><button onClick={() => removePhoto('qr')} className="absolute top-0 right-10 bg-red-500 text-white w-5 h-5 rounded-full text-xs font-bold hover:bg-red-700">&times;</button></div>}
                  <input name="bank_name" value={formData.bank_name} onChange={handleChange} placeholder="Tên Ngân hàng (VD: Vietcombank)" className="w-full border p-2 text-sm rounded" />
                  <input name="bank_owner" value={formData.bank_owner} onChange={handleChange} placeholder="Tên Chủ TK" className="w-full border p-2 text-sm rounded" />
                  <input name="bank_account" value={formData.bank_account} onChange={handleChange} placeholder="Số Tài Khoản" className="w-full border p-2 text-sm rounded" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}