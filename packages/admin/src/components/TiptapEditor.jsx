// src/components/TiptapEditor.jsx - Rich text editor wrapping Tiptap
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useRef, useCallback, useState } from 'react';
import {
  Bold, Italic, Strikethrough, Heading2, Heading3, Heading4,
  List, ListOrdered, Quote, Code2, Link2, ImagePlus, Minus,
  Undo2, Redo2, BarChart3, Frame
} from 'lucide-react';
import publicApi from '../services/publicApi';
import ResizableImage from './ResizableImage';
import ClimateWidgetExtension from './editor/ClimateWidgetExtension';
import ClimateWidgetInserter from './editor/ClimateWidgetInserter';
import IframeExtension from './editor/IframeExtension';
import IframeInserter from './editor/IframeInserter';
import './TiptapEditor.css';

// Custom Image extension with width attribute and resizable node view
const ResizableImageExtension = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100',
        parseHTML: (el) => el.getAttribute('data-width') || '100',
        renderHTML: (attrs) => ({ 'data-width': attrs.width }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImage);
  },
});

function TiptapEditor({ content, onChange }) {
  const fileInputRef = useRef(null);
  const [showWidgetInserter, setShowWidgetInserter] = useState(false);
  const [showIframeInserter, setShowIframeInserter] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      ResizableImageExtension.configure({
        HTMLAttributes: { class: 'article-image' },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({
        placeholder: 'Write your article content here...',
      }),
      ClimateWidgetExtension,
      IframeExtension,
    ],
    content: content || { type: 'doc', content: [{ type: 'paragraph' }] },
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  const handleImageUpload = useCallback(async (file) => {
    if (!editor || !file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await publicApi.post('/admin/articles/images?purpose=inline', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      editor.chain().focus().setImage({ src: res.data.url, width: '100' }).run();
    } catch (err) {
      console.error('Image upload failed:', err);
      alert('Image upload failed. Please try again.');
    }
  }, [editor]);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file);
      e.target.value = '';
    }
  };

  const handleLinkClick = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL:', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  if (!editor) return null;

  return (
    <div className="tiptap-editor-wrapper">
      <div className="tiptap-toolbar">
        <div className="tiptap-toolbar-group">
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''} title="Bold">
            <Bold size={16} />
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'is-active' : ''} title="Italic">
            <Italic size={16} />
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={editor.isActive('strike') ? 'is-active' : ''} title="Strikethrough">
            <Strikethrough size={16} />
          </button>
        </div>

        <div className="tiptap-toolbar-group">
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''} title="Heading 2">
            <Heading2 size={16} />
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''} title="Heading 3">
            <Heading3 size={16} />
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} className={editor.isActive('heading', { level: 4 }) ? 'is-active' : ''} title="Heading 4">
            <Heading4 size={16} />
          </button>
        </div>

        <div className="tiptap-toolbar-group">
          <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'is-active' : ''} title="Bullet List">
            <List size={16} />
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={editor.isActive('orderedList') ? 'is-active' : ''} title="Ordered List">
            <ListOrdered size={16} />
          </button>
        </div>

        <div className="tiptap-toolbar-group">
          <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={editor.isActive('blockquote') ? 'is-active' : ''} title="Blockquote">
            <Quote size={16} />
          </button>
          <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={editor.isActive('codeBlock') ? 'is-active' : ''} title="Code Block">
            <Code2 size={16} />
          </button>
        </div>

        <div className="tiptap-toolbar-group">
          <button type="button" onClick={handleLinkClick} className={editor.isActive('link') ? 'is-active' : ''} title="Link">
            <Link2 size={16} />
          </button>
          <button type="button" onClick={handleImageClick} title="Insert Image">
            <ImagePlus size={16} />
          </button>
          <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">
            <Minus size={16} />
          </button>
          <button type="button" onClick={() => setShowWidgetInserter(true)} title="Insert Climate Widget" style={{ color: '#16a34a' }}>
            <BarChart3 size={16} />
          </button>
          <button type="button" onClick={() => setShowIframeInserter(true)} title="Insert Iframe" style={{ color: '#16a34a' }}>
            <Frame size={16} />
          </button>
        </div>

        <div className="tiptap-toolbar-group">
          <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
            <Undo2 size={16} />
          </button>
          <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
            <Redo2 size={16} />
          </button>
        </div>
      </div>

      <div className="tiptap-content">
        <EditorContent editor={editor} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {showWidgetInserter && (
        <ClimateWidgetInserter
          editor={editor}
          onClose={() => setShowWidgetInserter(false)}
        />
      )}

      {showIframeInserter && (
        <IframeInserter
          editor={editor}
          onClose={() => setShowIframeInserter(false)}
        />
      )}
    </div>
  );
}

export default TiptapEditor;
