'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, ImagePlus, Link2, Loader2, MessageCircle, Pencil, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { getAbsoluteFileUrl, getCanonicalFileUrl, uploadBlogCoverImageToServer } from '@/lib/fileUpload';
import { useAuthStore } from '@/store/authStore';
import { blogPermissions, canUseBlogPermission } from '@/lib/blogPermissions';

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  contentHtml: string;
  coverImageUrl: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminBlogQuestion = {
  id: string;
  question: string;
  answer: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  answeredAt: string | null;
  askedBy: { id: string; name: string | null; email: string | null; mobile: string | null };
  answeredBy: { id: string; name: string | null } | null;
};

type BlogForm = {
  title: string;
  excerpt: string;
  contentHtml: string;
  coverImageUrl: string;
  isPublished: boolean;
};

type EditorToolbarState = {
  block: 'p' | 'h2' | 'h3' | 'h4' | 'blockquote';
  fontSize: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  unorderedList: boolean;
  orderedList: boolean;
};

const EMPTY_FORM: BlogForm = {
  title: '',
  excerpt: '',
  contentHtml: '<h2>Start writing your article</h2><p>Share useful information with the JCB Exchange community.</p>',
  coverImageUrl: '',
  isPublished: false,
};

const FONT_SIZE_COMMAND_LEVELS: Record<string, string> = {
  '12px': '1',
  '14px': '2',
  '16px': '3',
  '18px': '4',
  '24px': '5',
  '32px': '6',
  '40px': '7',
};

const FONT_SIZE_BY_COMMAND_LEVEL = Object.fromEntries(
  Object.entries(FONT_SIZE_COMMAND_LEVELS).map(([fontSize, commandLevel]) => [commandLevel, fontSize]),
);

const DEFAULT_TOOLBAR_STATE: EditorToolbarState = {
  block: 'p',
  fontSize: '16px',
  bold: false,
  italic: false,
  underline: false,
  unorderedList: false,
  orderedList: false,
};

const toForm = (post: BlogPost): BlogForm => ({
  title: post.title,
  excerpt: post.excerpt || '',
  contentHtml: post.contentHtml,
  coverImageUrl: post.coverImageUrl || '',
  isPublished: post.isPublished,
});

const slugify = (value: string) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const getSlugPreview = (title: string) => slugify(title) || 'your-article-slug';

const normalizeEditorImageUrls = (html: string) => {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('img[src]').forEach((image) => {
    const source = image.getAttribute('src');
    const absoluteUrl = source ? getAbsoluteFileUrl(source) : '';
    if (absoluteUrl) image.setAttribute('src', absoluteUrl);
  });
  return template.innerHTML;
};

const normalizeStoredEditorImageUrls = (html: string) => {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('img[src]').forEach((image) => {
    const source = image.getAttribute('src');
    const canonicalUrl = source ? getCanonicalFileUrl(source) : '';
    if (canonicalUrl) image.setAttribute('src', canonicalUrl);
  });
  return template.innerHTML;
};

const formatDate = (value: string) => new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
}).format(new Date(value));

const getErrorMessage = (error: unknown, fallback: string) => {
  const response = (error as { response?: { data?: { error?: string } } })?.response;
  return response?.data?.error || fallback;
};

export default function BlogContentManager() {
  const user = useAuthStore((state) => state.user);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canCreate = isSuperAdmin || canUseBlogPermission(user, blogPermissions.create);
  const canEdit   = isSuperAdmin || canUseBlogPermission(user, blogPermissions.update);
  const canDelete = isSuperAdmin || canUseBlogPermission(user, blogPermissions.delete);

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [form, setForm] = useState<BlogForm>(EMPTY_FORM);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingInline, setUploadingInline] = useState(false);
  const [questions, setQuestions] = useState<AdminBlogQuestion[]>([]);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionActionId, setQuestionActionId] = useState<string | null>(null);
  const [toolbarState, setToolbarState] = useState<EditorToolbarState>(DEFAULT_TOOLBAR_STATE);
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef<Range | null>(null);

  const loadPosts = useCallback(async () => {
    try {
      const response = await api.get<{ data: BlogPost[] }>('/superadmin/blogs');
      setPosts(response.data.data || []);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to load blog posts.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadQuestions = useCallback(async (blogId: string) => {
    setQuestionsLoading(true);
    try {
      const response = await api.get<{ data: AdminBlogQuestion[] }>(`/superadmin/blogs/${blogId}/questions`);
      const nextQuestions = response.data.data || [];
      setQuestions(nextQuestions);
      setQuestionAnswers(Object.fromEntries(nextQuestions.map((item) => [item.id, item.answer || ''])));
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to load community questions.'));
      setQuestions([]);
    } finally {
      setQuestionsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPosts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPosts]);

  useEffect(() => {
    if (!selectedId) return undefined;

    const timer = window.setTimeout(() => {
      void loadQuestions(selectedId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadQuestions, selectedId]);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== form.contentHtml) {
      editorRef.current.innerHTML = normalizeEditorImageUrls(form.contentHtml);
    }
  }, [form.contentHtml, selectedId]);

  const readToolbarState = useCallback((): EditorToolbarState => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !editor.contains(selection.anchorNode)) {
      return DEFAULT_TOOLBAR_STATE;
    }

    const anchorElement = selection.anchorNode instanceof Element
      ? selection.anchorNode
      : selection.anchorNode?.parentElement;
    const blockElement = anchorElement?.closest('h2, h3, h4, p, blockquote');
    const blockTag = blockElement?.tagName.toLowerCase();
    const block = blockTag === 'h2' || blockTag === 'h3' || blockTag === 'h4' || blockTag === 'blockquote'
      ? blockTag
      : 'p';

    let fontSize = FONT_SIZE_BY_COMMAND_LEVEL[document.queryCommandValue('fontSize')] || '16px';
    let currentElement = anchorElement;
    while (currentElement && currentElement !== editor) {
      if (currentElement instanceof HTMLElement && currentElement.style.fontSize) {
        const explicitFontSize = currentElement.style.fontSize.replace(/\s+/g, '');
        if (FONT_SIZE_COMMAND_LEVELS[explicitFontSize]) {
          fontSize = explicitFontSize;
          break;
        }
      }
      currentElement = currentElement.parentElement;
    }

    return {
      block,
      fontSize,
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
    };
  }, []);

  const syncToolbarState = useCallback(() => {
    setToolbarState(readToolbarState());
  }, [readToolbarState]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return undefined;

    const handleSelectionChange = () => syncToolbarState();
    document.addEventListener('selectionchange', handleSelectionChange);
    editor.addEventListener('keyup', handleSelectionChange);
    editor.addEventListener('mouseup', handleSelectionChange);
    editor.addEventListener('focus', handleSelectionChange);
    editor.addEventListener('input', handleSelectionChange);
    syncToolbarState();

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      editor.removeEventListener('keyup', handleSelectionChange);
      editor.removeEventListener('mouseup', handleSelectionChange);
      editor.removeEventListener('focus', handleSelectionChange);
      editor.removeEventListener('input', handleSelectionChange);
    };
  }, [syncToolbarState]);

  const startNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setQuestions([]);
    setQuestionAnswers({});
  };

  const editPost = (post: BlogPost) => {
    setSelectedId(post.id);
    setForm(toForm(post));
    setQuestions([]);
    setQuestionAnswers({});
  };

  const moderateQuestion = async (item: AdminBlogQuestion, status: AdminBlogQuestion['status']) => {
    if (!selectedId) return;
    const answer = (questionAnswers[item.id] ?? item.answer ?? '').trim();
    if (status === 'APPROVED' && answer.length < 2) {
      toast.error('Add an answer before approving this question.');
      return;
    }

    setQuestionActionId(item.id);
    try {
      const response = await api.patch<{ data: AdminBlogQuestion }>(
        `/superadmin/blogs/${selectedId}/questions/${item.id}`,
        { status, answer },
      );
      const updated = response.data.data;
      setQuestions((current) => current.map((questionItem) => questionItem.id === updated.id ? updated : questionItem));
      setQuestionAnswers((current) => ({ ...current, [updated.id]: updated.answer || '' }));
      toast.success(status === 'APPROVED' ? 'Question answered and published.' : `Question ${status.toLowerCase()}.`);
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to update this question.'));
    } finally {
      setQuestionActionId(null);
    }
  };

  const deleteQuestion = async (item: AdminBlogQuestion) => {
    if (!selectedId || !window.confirm('Delete this question permanently?')) return;
    setQuestionActionId(item.id);
    try {
      await api.delete(`/superadmin/blogs/${selectedId}/questions/${item.id}`);
      setQuestions((current) => current.filter((questionItem) => questionItem.id !== item.id));
      toast.success('Question deleted.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to delete this question.'));
    } finally {
      setQuestionActionId(null);
    }
  };

  const updateForm = <K extends keyof BlogForm>(key: K, value: BlogForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      selectionRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const selection = window.getSelection();
    if (!selection || !selectionRef.current) return;
    selection.removeAllRanges();
    selection.addRange(selectionRef.current);
  };

  const runCommand = (command: string, value?: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, value);
    updateForm('contentHtml', editorRef.current?.innerHTML || '');
    syncToolbarState();
  };

  const applyFontSize = (fontSize: string) => {
    editorRef.current?.focus();
    restoreSelection();

    const commandLevel = FONT_SIZE_COMMAND_LEVELS[fontSize];
    if (!commandLevel) return;
    document.execCommand('fontSize', false, commandLevel);
    editorRef.current?.querySelectorAll(`font[size="${commandLevel}"]`).forEach((fontNode) => {
      const span = document.createElement('span');
      span.style.fontSize = fontSize;
      while (fontNode.firstChild) span.appendChild(fontNode.firstChild);
      fontNode.replaceWith(span);
    });
    updateForm('contentHtml', editorRef.current?.innerHTML || '');
    syncToolbarState();
  };

  const handleCoverUpload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadBlogCoverImageToServer(file);
      updateForm('coverImageUrl', uploaded.fileUrl);
      toast.success('Cover image uploaded.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to upload cover image.'));
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleInlineImageUpload = async (file?: File) => {
    if (!file) return;
    saveSelection();
    setUploadingInline(true);
    try {
      const uploaded = await uploadBlogCoverImageToServer(file);
      const imageUrl = getAbsoluteFileUrl(uploaded.fileUrl) || uploaded.absoluteUrl;
      if (!imageUrl) {
        throw new Error('The uploaded image URL was not returned by the server.');
      }

      editorRef.current?.focus();
      if (selectionRef.current) {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(selectionRef.current);
      }

      const editor = editorRef.current;
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!editor || !selection || !range || !editor.contains(range.commonAncestorContainer)) {
        throw new Error('Place the cursor inside the article before inserting an image.');
      }

      range.deleteContents();
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = 'Blog image';
      image.loading = 'lazy';
      image.className = 'rounded-xl shadow-sm';
      range.insertNode(image);

      const nextParagraph = document.createElement('p');
      nextParagraph.appendChild(document.createElement('br'));
      const currentBlock = image.closest('p, h2, h3, h4, blockquote, li');
      if (currentBlock?.parentNode) {
        currentBlock.parentNode.insertBefore(nextParagraph, currentBlock.nextSibling);
      } else {
        image.parentNode?.insertBefore(nextParagraph, image.nextSibling);
      }

      const nextRange = document.createRange();
      nextRange.selectNodeContents(nextParagraph);
      nextRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(nextRange);
      updateForm('contentHtml', editorRef.current?.innerHTML || '');
      toast.success('Image inserted in the article.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to upload article image.'));
    } finally {
      setUploadingInline(false);
      if (inlineImageInputRef.current) inlineImageInputRef.current.value = '';
    }
  };

  const savePost = async () => {
    if (!form.title.trim()) {
      toast.error('Add a blog title first.');
      return;
    }
    if (!form.contentHtml.replace(/<[^>]+>/g, '').trim()) {
      toast.error('Add some article content first.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        contentHtml: normalizeStoredEditorImageUrls(form.contentHtml),
      };
      const response = selectedId
        ? await api.put<{ data: BlogPost }>(`/superadmin/blogs/${selectedId}`, payload)
        : await api.post<{ data: BlogPost }>('/superadmin/blogs', payload);
      const saved = response.data.data;
      setPosts((current) => selectedId
        ? current.map((post) => (post.id === saved.id ? saved : post))
        : [saved, ...current]);
      setSelectedId(saved.id);
      setForm(toForm(saved));
      toast.success(saved.isPublished ? 'Blog published successfully.' : 'Blog draft saved successfully.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to save blog post.'));
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async (post: BlogPost) => {
    if (!window.confirm(`Delete “${post.title}”? This cannot be undone.`)) return;
    try {
      await api.delete(`/superadmin/blogs/${post.id}`);
      setPosts((current) => current.filter((item) => item.id !== post.id));
      if (selectedId === post.id) startNew();
      toast.success('Blog post deleted.');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to delete blog post.'));
    }
  };

  const toolbarButtonClass = (active: boolean, compact = false) => `rounded-lg border px-3 py-2 ${compact ? 'text-xs' : 'text-sm'} transition ${active ? 'border-[#d59f00] bg-amber-100 text-gray-950 shadow-sm' : 'border-gray-300 bg-white text-gray-800'} hover:border-amber-400`;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm xl:max-h-[calc(100vh-140px)] xl:overflow-y-auto xl:[scrollbar-width:none] xl:[&::-webkit-scrollbar]:hidden">
          <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <h2 className="font-bold text-gray-900">Articles</h2>
              <p className="text-xs text-gray-500">{posts.length} total</p>
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={startNew}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#FFC107] px-3.5 py-2 text-xs font-bold text-gray-950 transition hover:bg-[#ffca28] shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5" />
                New article
              </button>
            )}
          </div>
            {loading ? <div className="flex items-center gap-2 p-4 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading articles...</div> : posts.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500">No articles yet. Create your first one.</div> : <div className="space-y-2">{posts.map((post) => <div key={post.id} className={`rounded-xl border p-3 transition ${selectedId === post.id ? 'border-[#FFC107] bg-amber-50/60' : 'border-gray-200 hover:border-amber-300'}`}><button type="button" onClick={() => editPost(post)} className="w-full text-left"><p className="line-clamp-2 text-sm font-semibold text-gray-900">{post.title}</p><div className="mt-2 flex items-center justify-between gap-2 text-[11px]"><span className={post.isPublished ? 'font-semibold text-emerald-600' : 'text-gray-500'}>{post.isPublished ? 'Published' : 'Draft'}</span><span className="text-gray-400">{formatDate(post.updatedAt)}</span></div></button><div className="mt-2 flex justify-end gap-1 border-t border-gray-200 pt-2">{canEdit && <button type="button" onClick={() => editPost(post)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900" aria-label="Edit article"><Pencil className="h-4 w-4" /></button>}{canDelete && <button type="button" onClick={() => void deletePost(post)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" aria-label="Delete article"><Trash2 className="h-4 w-4" /></button>}</div></div>)}</div>}

          </aside>

          <main className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6 xl:max-h-[calc(100vh-170px)] xl:overflow-y-auto xl:[scrollbar-width:none] xl:[&::-webkit-scrollbar]:hidden">
            <div className="mb-5 flex flex-col gap-2 border-b border-gray-100 pb-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold text-gray-900">{selectedId ? 'Edit article' : 'Create article'}</h2><p className="text-sm text-gray-500">Use the editor to format text, lists, links, and inline images.</p></div><label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700"><input type="checkbox" checked={form.isPublished} onChange={(event) => updateForm('isPublished', event.target.checked)} className="h-4 w-4 accent-[#FFC107]" />Publish on save</label></div>

            <div className="grid gap-5 lg:grid-cols-2">
              <label className="block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">Article title *</span><input value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder="e.g. 5 things to check before buying a used JCB" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#FFC107] focus:ring-2 focus:ring-amber-100" /><span className="mt-1 block text-xs text-gray-400">SEO URL: /blog/{getSlugPreview(form.title)}{selectedId ? ' (URL stays stable when you edit)' : ''}</span></label>
            </div>

            <label className="mt-5 block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">Short excerpt</span><textarea value={form.excerpt} onChange={(event) => updateForm('excerpt', event.target.value)} maxLength={500} rows={3} placeholder="A short summary shown on blog cards and search previews..." className="w-full resize-y rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#FFC107] focus:ring-2 focus:ring-amber-100" /></label>

            <div className="mt-5 rounded-2xl border border-dashed border-amber-300 bg-amber-50/40 p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-center"><div className="h-28 w-full overflow-hidden rounded-xl bg-gray-100 sm:w-48">{form.coverImageUrl ? <img src={getAbsoluteFileUrl(form.coverImageUrl) || form.coverImageUrl} alt="Blog cover preview" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-gray-400">No cover image</div>}</div><div className="min-w-0 flex-1"><p className="font-semibold text-gray-900">Cover image</p><p className="mt-1 text-xs leading-5 text-gray-500">JPG, PNG, or WEBP. Images are compressed before upload and stored in Google Drive under year/month folders. Maximum 5MB.</p><input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void handleCoverUpload(event.target.files?.[0])} /><button type="button" onClick={() => imageInputRef.current?.click()} disabled={uploading} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:border-amber-400 disabled:opacity-60">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{uploading ? 'Uploading...' : form.coverImageUrl ? 'Replace cover image' : 'Upload cover image'}</button></div>{form.coverImageUrl && <button type="button" onClick={() => updateForm('coverImageUrl', '')} className="self-start rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove cover image"><X className="h-4 w-4" /></button>}</div></div>

            <div className="mt-5 rounded-2xl border border-gray-200 bg-white">
              <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-t-2xl border-b border-gray-200 bg-gray-50/95 p-3 shadow-xs backdrop-blur-xs">
                <select value={toolbarState.block} onMouseDown={saveSelection} onChange={(event) => runCommand('formatBlock', event.target.value)} className={`rounded-lg border bg-white px-2 py-2 text-xs font-medium ${toolbarState.block !== 'p' ? 'border-[#d59f00] bg-amber-100 font-bold text-gray-950' : 'border-gray-300 text-gray-800'}`} aria-label="Text style">
                  <option value="p">Paragraph</option>
                  <option value="h2">Heading 2</option>
                  <option value="h3">Heading 3</option>
                  <option value="h4">Heading 4</option>
                  <option value="blockquote">Quote</option>
                </select>
                <select value={toolbarState.fontSize} onMouseDown={saveSelection} onChange={(event) => applyFontSize(event.target.value)} className={`rounded-lg border bg-white px-2 py-2 text-xs font-medium ${toolbarState.fontSize !== '16px' ? 'border-[#d59f00] bg-amber-100 font-bold text-gray-950' : 'border-gray-300 text-gray-800'}`} aria-label="Font size">
                  <option value="12px">12 px</option>
                  <option value="14px">14 px</option>
                  <option value="16px">16 px</option>
                  <option value="18px">18 px</option>
                  <option value="24px">24 px</option>
                  <option value="32px">32 px</option>
                  <option value="40px">40 px</option>
                </select>
                <button type="button" aria-pressed={toolbarState.bold} onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => runCommand('bold')} className={`${toolbarButtonClass(toolbarState.bold)} font-bold`}>B</button>
                <button type="button" aria-pressed={toolbarState.italic} onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => runCommand('italic')} className={`${toolbarButtonClass(toolbarState.italic)} italic`}>I</button>
                <button type="button" aria-pressed={toolbarState.underline} onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => runCommand('underline')} className={`${toolbarButtonClass(toolbarState.underline)} underline`}>U</button>
                <button type="button" aria-pressed={toolbarState.unorderedList} onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => runCommand('insertUnorderedList')} className={toolbarButtonClass(toolbarState.unorderedList, true)}>• List</button>
                <button type="button" aria-pressed={toolbarState.orderedList} onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => runCommand('insertOrderedList')} className={toolbarButtonClass(toolbarState.orderedList, true)}>1. List</button>
                <button type="button" onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => { const url = window.prompt('Enter link URL'); if (url) runCommand('createLink', url); }} className={`inline-flex items-center gap-1 ${toolbarButtonClass(false, true)}`}><Link2 className="h-3.5 w-3.5" />Link</button>
                <input ref={inlineImageInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void handleInlineImageUpload(event.target.files?.[0])} />
                <button type="button" onMouseDown={(event) => { event.preventDefault(); saveSelection(); }} onClick={() => inlineImageInputRef.current?.click()} disabled={uploadingInline} className={`inline-flex items-center gap-1 ${toolbarButtonClass(false, true)} disabled:opacity-60`}>{uploadingInline ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}Inline image</button>
              </div>
              <div ref={editorRef} contentEditable suppressContentEditableWarning onInput={() => { updateForm('contentHtml', editorRef.current?.innerHTML || ''); syncToolbarState(); }} onBlur={saveSelection} onKeyUp={saveSelection} onMouseUp={() => { saveSelection(); syncToolbarState(); }} className="prose min-h-[360px] max-w-none px-5 py-5 text-gray-800 outline-none prose-headings:text-gray-900 prose-img:rounded-xl prose-img:shadow-sm" />
            </div>

            {selectedId && (
              <section className="mt-6 rounded-2xl border border-gray-200 bg-gray-50/60 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 border-b border-gray-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-5 w-5 text-[#a87500]" />
                      <h3 className="font-bold text-gray-900">Community Q&amp;A</h3>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-gray-500">Review visitor questions, write an official answer, then publish it on the article.</p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500">{questions.length} total</span>
                </div>

                {questionsLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin text-[#FFC107]" />Loading questions...</div>
                ) : questions.length === 0 ? (
                  <p className="py-6 text-center text-sm text-gray-500">No visitor questions yet.</p>
                ) : (
                  <div className="mt-4 space-y-4">
                    {questions.map((item) => {
                      const actionLoading = questionActionId === item.id;
                      return (
                        <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold leading-6 text-gray-900">{item.question}</p>
                              <p className="mt-1 text-xs text-gray-400">{item.askedBy.name || 'Community member'} · {formatDate(item.createdAt)}</p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : item.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{item.status}</span>
                          </div>
                          <textarea
                            value={questionAnswers[item.id] || ''}
                            onChange={(event) => setQuestionAnswers((current) => ({ ...current, [item.id]: event.target.value }))}
                            maxLength={5000}
                            rows={3}
                            placeholder="Write the official JCB Exchange answer..."
                            className="mt-3 w-full resize-y rounded-lg border border-gray-300 px-3 py-2.5 text-sm leading-6 outline-none focus:border-[#FFC107] focus:ring-2 focus:ring-amber-100"
                          />
                          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                            <button type="button" onClick={() => void moderateQuestion(item, 'REJECTED')} disabled={actionLoading} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
                            <button type="button" onClick={() => void moderateQuestion(item, 'PENDING')} disabled={actionLoading} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Keep pending</button>
                            <button type="button" onClick={() => void moderateQuestion(item, 'APPROVED')} disabled={actionLoading} className="rounded-lg bg-[#FFC107] px-3 py-2 text-xs font-bold text-gray-950 hover:bg-[#ffca28] disabled:opacity-50">{actionLoading ? 'Saving...' : 'Answer & publish'}</button>
                            <button type="button" onClick={() => void deleteQuestion(item)} disabled={actionLoading} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" aria-label="Delete question"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={startNew} className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">Clear</button>{(canCreate || canEdit) && <button type="button" onClick={() => void savePost()} disabled={saving || uploading || uploadingInline} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-6 py-3 text-sm font-bold text-gray-950 hover:bg-[#ffca28] disabled:cursor-not-allowed disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving...' : form.isPublished ? 'Save & publish' : 'Save draft'}</button>}</div>
          </main>
        </div>
    </div>
  );
}
