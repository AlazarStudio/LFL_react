import React, { useEffect, useState } from 'react';
import { useInput } from 'react-admin';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const RichTextInput = (props) => {
  const {
    field: { value = '', onChange },
    fieldState: { error },
  } = useInput(props);

  // Локальное состояние для редактора
  const [editorValue, setEditorValue] = useState(value);

  // Используем ref для предотвращения вызова onChange во время рендеринга
  const isMounted = React.useRef(false);

  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true;
      return;
    }
    if (value !== editorValue) {
      setEditorValue(value); // Обновляем локальное состояние, если value изменилось
    }
  }, [value]);

  // Обработка изменения текста
  const handleChange = (content) => {
    setEditorValue(content);
    // Чтобы избежать вызова onChange в процессе рендеринга, ставим асинхронный вызов
    setTimeout(() => {
      if (onChange) onChange(content);
    }, 0);
  };

  const modules = {
    toolbar: [
      [{ header: '1' }, { header: '2' }, { font: [] }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['bold', 'italic', 'underline', 'strike', 'blockquote'],
      [{ indent: '-1' }, { indent: '+1' }, { align: [] }],
      [{ color: [] }, { background: [] }],
      // [{ align: [] }],

      ['clean'],
      // ['link', 'image', 'video']
    ],
  };

  return (
    <div
      style={{
        width: '100%',
        height: '380px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <p>{props.label}</p>
      <ReactQuill
        value={editorValue}
        onChange={handleChange}
        modules={modules}
        style={{ height: '300px', whiteSpace: 'pre-wrap' }}
      />
      {error && <span style={{ color: 'red' }}>{error.message}</span>}
    </div>
  );
};

export default RichTextInput;
