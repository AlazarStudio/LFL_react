import React, { useMemo, useRef, useState } from 'react';
import serverConfig from '../../../../../serverConfig';
import uploadsConfig from '../../../../../uploadsConfig';
// import { toast } from '../common/toast';

const API = `${serverConfig}/tournaments`;
const UPLOAD_API = `${serverConfig}/upload`;
const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');

function buildSrc(s){
  if(!s) return '';
  if(/^https?:\/\//i.test(s)) return s;
  return `${ASSETS_BASE}${s}`;
}
function toDateInput(val) {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function TournamentOverview({ tournamentId, tournament, assetsBase, onReload }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState(()=>{
    const t = tournament || {};
    return {
      title: t.title || '',
      season: t.season || '',
      city: t.city || '',
      halfMinutes: t.halfMinutes ?? 45,
      halves: t.halves ?? 2,
      startDate: toDateInput(t.startDate),
      registrationDeadline: toDateInput(t.registrationDeadline),
      images: Array.isArray(t.images)? t.images : [],
    };
  });
  const imagesRef = useRef(null);

  async function uploadMany(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return [];
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    const res = await fetch(UPLOAD_API, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || data?.message || `Upload HTTP ${res.status}`);
    const urls = Array.isArray(data.filePaths) ? data.filePaths : [];
    if (!urls.length) throw new Error('Сервер не вернул пути к файлам');
    return urls;
  }
  async function onUploadImages(e){
    try{
      setLoading(true); setErr('');
      const urls = await uploadMany(e.target.files);
      setForm((s)=>({...s, images:[...s.images, ...urls]}));
      toast('Файлы загружены','success');
    }catch(e){
      setErr(e.message || 'Не удалось загрузить изображения');
      toast('Не удалось загрузить изображения','error');
    }finally{
      setLoading(false);
      if(imagesRef.current) imagesRef.current.value='';
    }
  }
  function removeImage(url){
    setForm((s)=>({...s, images: s.images.filter((u)=>u!==url)}));
  }

  async function save(){
    try{
      setLoading(true); setErr('');
      const res = await fetch(`${API}/${tournamentId}`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          ...form,
          season: form.season || null,
          city: form.city || null,
          startDate: form.startDate || null,
          registrationDeadline: form.registrationDeadline || null,
        })
      });
      const data = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toast('Сохранено','success');
      onReload?.();
    }catch(e){
      setErr(e.message || 'Ошибка сохранения'); toast('Ошибка сохранения','error');
    }finally{
      setLoading(false);
    }
  }

  return (
    <section className="card">
      <h3>Общая информация</h3>
      {err && <div className="alert alert--error">{err}</div>}
      <div className="form">
        <div className="form__row">
          <label className="field">
            <span className="field__label">Название</span>
            <input className="input" value={form.title}
                   onChange={(e)=>setForm((s)=>({...s, title:e.target.value}))}/>
          </label>
          <label className="field">
            <span className="field__label">Сезон</span>
            <input className="input" value={form.season}
                   onChange={(e)=>setForm((s)=>({...s, season:e.target.value}))}/>
          </label>
          <label className="field">
            <span className="field__label">Город</span>
            <input className="input" value={form.city}
                   onChange={(e)=>setForm((s)=>({...s, city:e.target.value}))}/>
          </label>
        </div>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Минут в тайме</span>
            <input className="input" type="number" min={1} value={form.halfMinutes}
                   onChange={(e)=>setForm((s)=>({...s, halfMinutes:e.target.value}))}/>
          </label>
          <label className="field">
            <span className="field__label">Таймов</span>
            <input className="input" type="number" min={1} value={form.halves}
                   onChange={(e)=>setForm((s)=>({...s, halves:e.target.value}))}/>
          </label>
        </div>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Дата старта</span>
            <input className="input" type="date" value={form.startDate}
                   onChange={(e)=>setForm((s)=>({...s, startDate:e.target.value}))}/>
          </label>
          <label className="field">
            <span className="field__label">Дедлайн регистрации</span>
            <input className="input" type="date" value={form.registrationDeadline}
                   onChange={(e)=>setForm((s)=>({...s, registrationDeadline:e.target.value}))}/>
          </label>
        </div>

        <div className="form__row">
          <label className="field">
            <span className="field__label">Изображения</span>
            <div className="upload">
              <input ref={imagesRef} type="file" accept="image/*" multiple
                     onChange={onUploadImages} className="upload__input" />
              <button type="button" className="btn btn--ghost"
                      onClick={()=>imagesRef.current?.click()} disabled={loading}>
                Выбрать файлы
              </button>
              <span className="upload__hint">можно загрузить пачкой</span>
            </div>
            {form.images?.length>0 && (
              <div className="thumbs">
                {form.images.map((url)=>(
                  <div className="thumb" key={url}>
                    <img src={buildSrc(url)} alt="" />
                    <button type="button" className="thumb__remove"
                            onClick={()=>removeImage(url)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </label>
        </div>

        <div className="form__actions">
          <button className="btn btn--primary" onClick={save} disabled={loading}>Сохранить</button>
        </div>
      </div>
    </section>
  );
}
