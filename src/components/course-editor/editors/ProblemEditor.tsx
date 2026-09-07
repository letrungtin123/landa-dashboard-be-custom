import React, { useEffect, useRef, useState } from 'react';
import { HelpCircle, Check, Trash2, Plus, ImagePlus, Loader2, Video, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from './VideoEditor';
import RichTextEditor from '../RichTextEditor';
import { uploadCourseAsset, deleteCourseAssetByStoragePath } from '@/api/custom-course-authoring';
import { toast } from 'sonner';
import { storageUrl } from '@/utils/storage-url';
import { COURSE_ASSET_MAX_UPLOAD_BYTES, COURSE_ASSET_MAX_UPLOAD_LABEL } from '@/utils/course-asset-upload';
import ImageCarousel from '../ImageCarousel';
import UploadedVideoPreview from '../UploadedVideoPreview';
import CarouselImageOrder from '../CarouselImageOrder';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { getLocalizedApiError } from '@/utils/localized-error';
import {
  extractYoutubeId,
  normalizeProblemMedia,
  resolveProblemMediaImageUrl,
  toYoutubeUrl,
  type ProblemMedia,
} from '../problemMedia';

// OLX Templates chính xác từ frontend-app-authoring
const PROBLEM_TYPE_DEFINITIONS = [
  {
    id: 'multiplechoiceresponse',
    labelKey: 'courseEditorForms.problemSingleChoice',
    descKey: 'courseEditorForms.problemSingleChoiceDescription',
    boilerplate: 'multiplechoice.yaml',
    template: `<problem>
  <multiplechoiceresponse>
    <label>Câu hỏi của bạn</label>
    <choicegroup type="MultipleChoice">
      <choice correct="true">Đáp án đúng</choice>
      <choice correct="false">Đáp án sai A</choice>
      <choice correct="false">Đáp án sai B</choice>
    </choicegroup>
  </multiplechoiceresponse>
</problem>`,
  },
  {
    id: 'choiceresponse',
    labelKey: 'courseEditorForms.problemMultipleChoice',
    descKey: 'courseEditorForms.problemMultipleChoiceDescription',
    boilerplate: 'checkboxes_response.yaml',
    template: `<problem>
  <choiceresponse>
    <label>Câu hỏi của bạn</label>
    <checkboxgroup>
      <choice correct="true">Đáp án đúng A</choice>
      <choice correct="true">Đáp án đúng B</choice>
      <choice correct="false">Đáp án sai</choice>
    </checkboxgroup>
  </choiceresponse>
</problem>`,
  },
  {
    id: 'optionresponse',
    labelKey: 'courseEditorForms.problemDropdown',
    descKey: 'courseEditorForms.problemDropdownDescription',
    boilerplate: 'optionresponse.yaml',
    template: `<problem>
  <optionresponse>
    <label>Câu hỏi của bạn</label>
    <optioninput>
      <option correct="True">Đáp án đúng</option>
      <option correct="False">Đáp án sai A</option>
      <option correct="False">Đáp án sai B</option>
    </optioninput>
  </optionresponse>
</problem>`,
  },
  {
    id: 'numericalresponse',
    labelKey: 'courseEditorForms.problemNumerical',
    descKey: 'courseEditorForms.problemNumericalDescription',
    boilerplate: 'numericalresponse.yaml',
    template: `<problem>
  <numericalresponse answer="100">
    <label>Câu hỏi số học của bạn</label>
    <responseparam type="tolerance" default="5%"/>
    <formulaequationinput/>
  </numericalresponse>
</problem>`,
  },
  {
    id: 'stringresponse',
    labelKey: 'courseEditorForms.problemText',
    descKey: 'courseEditorForms.problemTextDescription',
    boilerplate: 'string_response.yaml',
    template: `<problem>
  <stringresponse answer="đáp án đúng" type="ci">
    <label>Câu hỏi của bạn</label>
    <additional_answer answer="đáp án thay thế" />
    <textline size="30"/>
  </stringresponse>
</problem>`,
  },
] as const;

type ProblemTypeDefinition = (typeof PROBLEM_TYPE_DEFINITIONS)[number];

export function getProblemTypes() {
  return PROBLEM_TYPE_DEFINITIONS.map((type) => ({
    ...type,
    label: i18n.t(type.labelKey),
    desc: i18n.t(type.descKey),
  }));
}

interface Choice {
  id: string;
  html: string;
  correct: boolean;
}

interface ProblemState {
  type: 'multiplechoiceresponse' | 'choiceresponse' | 'numericalresponse' | 'stringresponse' | 'optionresponse';
  rootAttrs: string;
  questionHtml: string;
  explanationHtml: string;
  choices: Choice[];
  tolerance?: string;
  hints: string[];
}

const XML_VOID_TAGS = [
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
] as const;

const xmlVoidTagPattern = XML_VOID_TAGS.join('|');
const xmlVoidOpenTagRegex = new RegExp(`<(${xmlVoidTagPattern})(\\s[^<>]*?)?>`, 'gi');
const xmlVoidCloseTagRegex = new RegExp(`</(${xmlVoidTagPattern})\\s*>`, 'gi');

function stripXhtmlNamespaces(value: string): string {
  return value.replace(/\s+xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
}

function normalizeXmlVoidTags(value: string): string {
  if (!value) return '';

  return value
    .replace(xmlVoidOpenTagRegex, (match, tag, attrs = '') => {
      if (/\/\s*>$/.test(match)) return match;
      return `<${String(tag).toLowerCase()}${attrs} />`;
    })
    .replace(xmlVoidCloseTagRegex, '');
}

function normalizeXmlEntities(value: string): string {
  return value.replace(/&nbsp;/gi, '&#160;');
}

function normalizeHtmlFragmentForProblemXml(html: string): string {
  if (!html) return '';
  const fallback = normalizeXmlEntities(normalizeXmlVoidTags(html));

  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return fallback;
  }

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const serialized = Array.from(doc.body.childNodes)
      .map(node => new XMLSerializer().serializeToString(node))
      .join('');

    return normalizeXmlVoidTags(stripXhtmlNamespaces(serialized));
  } catch {
    return fallback;
  }
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function normalizeProblemXmlForStorage(xmlStr: string): string {
  if (!xmlStr || typeof xmlStr !== 'string') return '';
  return normalizeXmlVoidTags(normalizeXmlEntities(xmlStr));
}

export function parseProblemXml(xmlStr: string): ProblemState | null {
  if (!xmlStr || typeof xmlStr !== 'string' || xmlStr.trim() === '') return null;
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(normalizeProblemXmlForStorage(xmlStr), 'text/xml');

  if (doc.querySelector('parsererror')) return null;
  
  const root = doc.querySelector('problem');
  if (!root) return null;

  const rootAttrs = Array.from(root.attributes).map(a => `${a.name}="${escapeXmlAttribute(a.value)}"`).join(' ');

  const typeNode = root.querySelector('multiplechoiceresponse, choiceresponse, numericalresponse, stringresponse, optionresponse'); 
  if (!typeNode) return null;

  const type = typeNode.tagName;
  
  let tolerance = '';
  let choices: Choice[] = [];
  let choicegroup: Element | null = null;
  
  if (type === 'numericalresponse' || type === 'stringresponse') {
    const ans = typeNode.getAttribute('answer');
    if (ans) {
      choices.push({ id: `choice-0-${Math.random().toString(36).substr(2, 9)}`, html: ans, correct: true });
    }
    const addAns = typeNode.querySelectorAll('additional_answer');
    addAns.forEach((a, i) => {
      choices.push({ id: `choice-${i+1}-${Math.random().toString(36).substr(2, 9)}`, html: a.getAttribute('answer') || '', correct: true });
    });
    
    if (type === 'numericalresponse') {
       tolerance = typeNode.querySelector('responseparam[type="tolerance"]')?.getAttribute('default') || '';
    }
  } else if (type === 'optionresponse') {
    const optioninput = typeNode.querySelector('optioninput');
    if (optioninput) {
       const optionElements = Array.from(optioninput.querySelectorAll('option'));
       if (optionElements.length > 0) {
           choices = optionElements.map((opt, i) => ({
             id: `choice-${i}-${Math.random().toString(36).substr(2, 9)}`,
             html: opt.textContent || '',
             correct: opt.getAttribute('correct') === 'true' || opt.getAttribute('correct') === 'True'
           }));
       } else {
           const correctStr = optioninput.getAttribute('correct') || '';
           const optionsStr = optioninput.getAttribute('options') || "()";
           const matches = [...optionsStr.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)];
           const opts = matches.map(m => m[1]);
           if (opts.length === 0) {
              const rawOpts = optionsStr.replace(/^\(|\)$/g, '').split(',').map(s => s.trim());
              opts.push(...rawOpts.filter(o => o));
           }
           choices = opts.map((opt, i) => ({
             id: `choice-${i}-${Math.random().toString(36).substr(2, 9)}`,
             html: opt,
             correct: opt === correctStr
           }));
       }
    }
  } else if (type === 'multiplechoiceresponse' || type === 'choiceresponse') {
    choicegroup = typeNode.querySelector('choicegroup, checkboxgroup');
    if (!choicegroup) return null;
    choices = Array.from(choicegroup.querySelectorAll('choice')).map((c, i) => ({
      id: `choice-${i}-${Math.random().toString(36).substr(2, 9)}`,
      correct: c.getAttribute('correct') === 'true' || c.getAttribute('correct') === 'True',
      html: Array.from(c.childNodes).map(n => new XMLSerializer().serializeToString(n)).join('')
    }));
  } else {
    return null;
  }

  let questionHtml = '';
  
  // Elements before typeNode
  for (let i = 0; i < root.childNodes.length; i++) {
    const node = root.childNodes[i];
    if (node === typeNode) break;
    if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
      questionHtml += new XMLSerializer().serializeToString(node);
    }
  }

  // Elements inside typeNode before choicegroup, responseparam, formulaequationinput, textline, additional_answer, optioninput
  for (let i = 0; i < typeNode.childNodes.length; i++) {
    const node = typeNode.childNodes[i];
    const nodeName = node.nodeName.toLowerCase();
    if (['choicegroup', 'checkboxgroup', 'responseparam', 'formulaequationinput', 'textline', 'additional_answer', 'optioninput'].includes(nodeName)) {
      break;
    }
    if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
      questionHtml += new XMLSerializer().serializeToString(node);
    }
  }

  const solutionNode = root.querySelector('solution');
  let explanationHtml = '';
  if (solutionNode) {
     const detailed = solutionNode.querySelector('.detailed-solution') || solutionNode;
     explanationHtml = Array.from(detailed.childNodes).map(n => new XMLSerializer().serializeToString(n)).join('');
     explanationHtml = explanationHtml.replace(/ xmlns="[^"]+"/g, '');
  }

  const demandhintNode = root.querySelector('demandhint');
  const hints: string[] = [];
  if (demandhintNode) {
    demandhintNode.querySelectorAll('hint').forEach(h => {
       hints.push(h.textContent || '');
    });
  }

  return {
    type: type as any,
    rootAttrs,
    questionHtml: questionHtml.trim(),
    choices,
    tolerance,
    explanationHtml: explanationHtml.trim(),
    hints
  };
}

function serializeProblemXml(state: ProblemState): string {
  let innerResponseXml = '';
  if (state.type === 'multiplechoiceresponse' || state.type === 'choiceresponse') {
    const isMulti = state.type === 'choiceresponse';
    const groupTag = isMulti ? 'checkboxgroup' : 'choicegroup';
    const choicesXml = state.choices.map(c => `      <choice correct="${c.correct ? 'true' : 'false'}">${normalizeHtmlFragmentForProblemXml(c.html)}</choice>`).join('\n');
    innerResponseXml = `    <${groupTag}>\n${choicesXml}\n    </${groupTag}>`;
  } else if (state.type === 'numericalresponse' || state.type === 'stringresponse') {
    const additionalAnswers = state.choices.slice(1).map(c => `    <additional_answer answer="${escapeXmlAttribute(c.html)}" />`).join('\n');
    
    if (state.type === 'numericalresponse') {
      innerResponseXml = `${additionalAnswers ? additionalAnswers + '\n' : ''}${state.tolerance ? `    <responseparam type="tolerance" default="${escapeXmlAttribute(state.tolerance)}" />\n` : ''}    <formulaequationinput />`;
    } else {
      innerResponseXml = `${additionalAnswers ? additionalAnswers + '\n' : ''}    <textline size="30"/>`;
    }
  } else if (state.type === 'optionresponse') {
    const optionsXml = state.choices.map(c => `      <option correct="${c.correct ? 'true' : 'false'}">${escapeXmlText(c.html)}</option>`).join('\n');
    innerResponseXml = `    <optioninput>\n${optionsXml}\n    </optioninput>`;
  }

  const responseAttrs = (state.type === 'numericalresponse' || state.type === 'stringresponse') 
    ? ` answer="${escapeXmlAttribute(state.choices[0]?.html || '')}"${state.type === 'stringresponse' ? ' type="ci"' : ''}` 
    : '';

  let solutionXml = '';
  const safeExplanationHtml = normalizeHtmlFragmentForProblemXml(state.explanationHtml);
  const cleanExp = safeExplanationHtml.trim();
  if (cleanExp && cleanExp !== '<p><br></p>' && cleanExp !== '<p><br /></p>') {
    solutionXml = `\n    <solution>\n<div class="detailed-solution">\n${safeExplanationHtml}\n</div>\n    </solution>`;
  }

  let hintsXml = '';
  const validHints = state.hints.filter(h => h.trim());
  if (validHints.length > 0) {
    const hintsList = validHints.map(h => `      <hint>${escapeXmlText(h)}</hint>`).join('\n');
    hintsXml = `\n    <demandhint>\n${hintsList}\n    </demandhint>`;
  }

  return `<problem${state.rootAttrs ? ' ' + state.rootAttrs : ''}>
${normalizeHtmlFragmentForProblemXml(state.questionHtml)}
  <${state.type}${responseAttrs}>
${innerResponseXml}
  </${state.type}>${solutionXml}${hintsXml}
</problem>`;
}

interface ProblemEditorProps {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  problemXml: string;
  onXmlChange: (v: string) => void;
  problemMedia?: ProblemMedia;
  onProblemMediaChange?: (v: ProblemMedia) => void;
  courseId?: string;
  selectedBoilerplate?: string;
  onAutoSave?: (nextMedia: ProblemMedia) => void | Promise<void>;
}

export default function ProblemEditor({
  displayName,
  onDisplayNameChange,
  problemXml,
  onXmlChange,
  problemMedia,
  onProblemMediaChange,
  courseId,
  selectedBoilerplate,
  onAutoSave,
}: ProblemEditorProps) {
  void selectedBoilerplate;
  const { t } = useTranslation();

  const [state, setState] = useState<ProblemState>(() => {
    const parsed = parseProblemXml(problemXml);
    if (parsed) return parsed;
    return {
      type: 'multiplechoiceresponse',
      rootAttrs: '',
      questionHtml: '<p>Nhập câu hỏi của bạn vào đây</p>',
      explanationHtml: '',
      choices: [
        { id: 'c1', html: 'Đáp án đúng', correct: true },
        { id: 'c2', html: 'Đáp án sai', correct: false }
      ],
      hints: []
    };
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const media = normalizeProblemMedia(problemMedia);
  const mediaRef = useRef<ProblemMedia>(media);
  const mediaSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);
  const [youtubeInput, setYoutubeInput] = useState(() => media.youtube_url || (media.youtube_id ? toYoutubeUrl(media.youtube_id) : ''));
  const youtubeId = extractYoutubeId(youtubeInput);

  const updateProblemMedia = (next: ProblemMedia) => {
    const normalized = normalizeProblemMedia(next);
    mediaRef.current = normalized;
    onProblemMediaChange?.(normalized);
  };
  const persistMediaDraft = (nextMedia: ProblemMedia) => {
    const run = mediaSaveQueueRef.current.then(async () => {
      await onAutoSave?.(nextMedia);
    });
    mediaSaveQueueRef.current = run.catch(() => {});
    return run;
  };

  const handleYoutubeChange = (value: string) => {
    setYoutubeInput(value);
    const id = extractYoutubeId(value);
    updateProblemMedia({
      ...media,
      youtube_id: id || undefined,
      youtube_url: id ? toYoutubeUrl(id) : undefined,
    });
  };

  const handleUploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!courseId) {
      toast.error(t('courseEditorForms.courseIdRequired'));
      return;
    }

    setUploading(true);
    const uploadedPaths: string[] = [];
    try {
      const uploaded: { src: string; alt: string }[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadCourseAsset(courseId, file);
        const src = result?.url || result?.storage_path || '';
        if (src) {
          uploaded.push({ src, alt: file.name });
          uploadedPaths.push(src);
        }
      }

      if (uploaded.length > 0) {
        const currentMedia = mediaRef.current;
        const nextMedia = {
          ...currentMedia,
          images: [...currentMedia.images, ...uploaded],
        };
        updateProblemMedia(nextMedia);
        try {
          await persistMediaDraft(nextMedia);
          toast.success(t('courseEditorForms.imageUploadSaved', { count: uploaded.length }));
        } catch (saveErr) {
          await Promise.allSettled(uploadedPaths.map(path => deleteCourseAssetByStoragePath(courseId, path)));
          updateProblemMedia(currentMedia);
          throw saveErr;
        }
      }
    } catch (err: any) {
      toast.error(t('courseEditorForms.imageUploadFailed', { message: getLocalizedApiError(err, t('courseUnit.unknownError')) }));
    } finally {
      setUploading(false);
    }
  };

  const handleUploadVideo = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!courseId) {
      toast.error(t('courseEditorForms.courseIdMissing'));
      return;
    }
    const file = files[0];
    const MAX_SIZE = COURSE_ASSET_MAX_UPLOAD_BYTES;
    if (file.size > MAX_SIZE) {
      toast.error(t('courseEditorForms.videoTooLarge', { size: `${(file.size / 1024 / 1024).toFixed(1)}MB`, limit: COURSE_ASSET_MAX_UPLOAD_LABEL }));
      return;
    }
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
      toast.error(t('courseEditorForms.unsupportedVideoFormat'));
      return;
    }
    setVideoUploading(true);
    try {
      const result = await uploadCourseAsset(courseId, file);
      const path = result?.storage_path || result?.url || '';
      if (path) {
        const previousMedia = mediaRef.current;
        const nextMedia = {
          ...previousMedia,
          video_storage_path: path,
          youtube_id: undefined,
          youtube_url: undefined,
        };
        updateProblemMedia(nextMedia);
        setYoutubeInput('');
        try {
          await persistMediaDraft(nextMedia);
          toast.success(t('courseEditorForms.videoUploadedSaved'));
        } catch (saveErr) {
          await deleteCourseAssetByStoragePath(courseId, path).catch(() => { /* Best-effort cleanup. */ });
          updateProblemMedia(previousMedia);
          throw saveErr;
        }
      }
    } catch (err: any) {
      toast.error(t('courseEditorForms.videoUploadFailed', { message: getLocalizedApiError(err, t('courseUnit.unknownError')) }));
    } finally {
      setVideoUploading(false);
    }
  };

  const handleDeleteVideo = async () => {
    const currentMedia = mediaRef.current;
    const videoPath = currentMedia.video_storage_path;
    if (!videoPath) return;
    const nextMedia = { ...currentMedia, video_storage_path: undefined };
    updateProblemMedia(nextMedia);
    let pendingDelete = false;
    try {
      await persistMediaDraft(nextMedia);
    } catch (err: any) {
      updateProblemMedia(currentMedia);
      toast.error(t('courseEditorForms.mediaSaveFailed', { message: getLocalizedApiError(err, t('courseUnit.unknownError')) }));
      return;
    }
    if (courseId) {
      try {
        const result = await deleteCourseAssetByStoragePath(courseId, videoPath);
        pendingDelete = !!result?.pending_delete;
      } catch {
        // The saved draft remains valid even if the old published asset is retained.
      }
    }
    toast.success(pendingDelete ? t('courseEditorForms.videoRemovedDraft') : t('courseEditorForms.videoDeleted'));
  };

  const handleRemoveImage = async (idx: number) => {
    const currentMedia = mediaRef.current;
    const removedImage = currentMedia.images[idx];
    if (!removedImage) return;
    const nextMedia = {
      ...currentMedia,
      images: currentMedia.images.filter((_, i) => i !== idx),
    };
    updateProblemMedia(nextMedia);
    try {
      await persistMediaDraft(nextMedia);
      if (courseId) await deleteCourseAssetByStoragePath(courseId, removedImage.src).catch(() => { /* Best-effort cleanup. */ });
      toast.success(t('courseEditorForms.imageDeletedSaved'));
    } catch (err: any) {
      updateProblemMedia(currentMedia);
      toast.error(t('courseEditorForms.imageDeleteFailed', { message: getLocalizedApiError(err, t('courseUnit.unknownError')) }));
    }
  };

  const handleMoveImage = async (fromIndex: number, toIndex: number) => {
    const currentMedia = mediaRef.current;
    const nextImages = [...currentMedia.images];
    const [moved] = nextImages.splice(fromIndex, 1);
    if (!moved) return;
    nextImages.splice(toIndex, 0, moved);
    const nextMedia = {
      ...currentMedia,
      images: nextImages,
    };
    updateProblemMedia(nextMedia);
    try {
      await persistMediaDraft(nextMedia);
    } catch (err: any) {
      updateProblemMedia(currentMedia);
      toast.error(t('courseEditorForms.imageOrderFailed', { message: getLocalizedApiError(err, t('courseUnit.unknownError')) }));
    }
  };

  const resolvedImages = media.images.map((img) => ({
    ...img,
    src: resolveProblemMediaImageUrl(img.src),
  }));

  const handleSelectType = (type: ProblemTypeDefinition) => {
    if (['multiplechoiceresponse', 'choiceresponse', 'numericalresponse', 'stringresponse', 'optionresponse'].includes(type.id)) {
      const isNumStr = type.id === 'numericalresponse' || type.id === 'stringresponse';
      const newState: ProblemState = {
        type: type.id as any,
        rootAttrs: '',
        questionHtml: '<p>Câu hỏi của bạn</p>',
        explanationHtml: '',
        choices: isNumStr ? [
          { id: 'c1', html: type.id === 'numericalresponse' ? '100' : 'đáp án đúng', correct: true }
        ] : [
          { id: 'c1', html: 'Đáp án đúng', correct: true },
          { id: 'c2', html: 'Đáp án sai', correct: false }
        ],
        tolerance: type.id === 'numericalresponse' ? '5%' : undefined,
        hints: []
      };
      setState(newState);
      onXmlChange(serializeProblemXml(newState));
    } else {
      onXmlChange(type.template);
    }
  };

  const updateState = (updater: (prev: ProblemState) => ProblemState) => {
    setState(prev => {
      const next = updater(prev);
      onXmlChange(serializeProblemXml(next));
      return next;
    });
  };

  const handleAddChoice = () => {
    updateState(s => ({
      ...s,
      choices: [...s.choices, { id: `c-${Date.now()}`, html: 'Đáp án mới', correct: false }]
    }));
  };

  const handleUpdateChoice = (id: string, updates: Partial<Choice>) => {
    updateState(s => ({
      ...s,
      choices: s.choices.map(c => c.id === id ? { ...c, ...updates } : c)
    }));
  };

  const handleDeleteChoice = (id: string) => {
    updateState(s => ({
      ...s,
      choices: s.choices.filter(c => c.id !== id)
    }));
  };

  const handleAddHint = () => {
    updateState(s => ({ ...s, hints: [...s.hints, 'Gợi ý mới'] }));
  };

  const handleUpdateHint = (idx: number, val: string) => {
    updateState(s => {
      const newHints = [...s.hints];
      newHints[idx] = val;
      return { ...s, hints: newHints };
    });
  };

  const handleDeleteHint = (idx: number) => {
    updateState(s => {
      const newHints = [...s.hints];
      newHints.splice(idx, 1);
      return { ...s, hints: newHints };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between border-b pb-4">
        <div className="w-1/2">
          <Field label={t('courseUnit.displayName')}>
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
              value={displayName}
              onChange={e => onDisplayNameChange(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="app-liquid-card rounded-xl border border-border bg-muted/10 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-bold">{t('courseEditorForms.mediaIllustration')}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('courseEditorForms.mediaIllustrationHint')}
          </p>
        </div>

        {!media.video_storage_path && (
          <Field label={t('courseEditorForms.youtubeUrlOrId')}>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Video className="h-4 w-4 text-muted-foreground" />
              </div>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm font-mono focus:ring-2 focus:ring-ring focus:outline-none"
                value={youtubeInput}
                onChange={e => handleYoutubeChange(e.target.value)}
                placeholder={t('courseEditorForms.youtubePlaceholder')}
              />
            </div>
            {youtubeInput && !youtubeId && (
              <p className="text-xs text-destructive mt-2">{t('courseEditorForms.invalidYoutube')}</p>
            )}
          </Field>
        )}

        {youtubeId && (
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-sm">
            <iframe
              key={youtubeId}
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed/${youtubeId}?rel=0`}
              title={t('courseEditorForms.youtubePreviewTitle')}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {/* Uploaded video preview */}
        {media.video_storage_path && (
          <div className="space-y-2">
            <UploadedVideoPreview storagePath={media.video_storage_path} />
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5" onClick={handleDeleteVideo}>
                <Trash2 className="h-3.5 w-3.5" /> {t('courseEditorForms.deleteVideo')}
              </Button>
            </div>
          </div>
        )}

        {/* Video upload button (khi chưa có YouTube và chưa có uploaded video) */}
        {!youtubeId && !media.video_storage_path && (
          <div className="app-liquid-card flex items-center gap-3 rounded-lg border border-border bg-background p-3">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-2"
              onClick={() => videoFileInputRef.current?.click()}
              disabled={videoUploading}
            >
              {videoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t('courseEditorForms.youtubeUpload')}
            </Button>
            <span className="text-xs text-muted-foreground">{t('courseEditorForms.videoFormatHint', { size: COURSE_ASSET_MAX_UPLOAD_LABEL })}</span>
            <input
              ref={videoFileInputRef}
              type="file"
              accept=".mp4,.webm,.mov"
              className="hidden"
              onChange={e => { handleUploadVideo(e.target.files); e.target.value = ''; }}
            />
          </div>
        )}

        <div className="space-y-3">
          <div className="app-liquid-card flex items-center gap-3 rounded-lg border border-border bg-background p-3">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              {t('courseEditorForms.uploadImage')}
            </Button>
            <span className="text-xs text-muted-foreground">{t('courseEditorForms.imageCarouselHint')}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => {
                handleUploadImages(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {resolvedImages.length === 1 && (
            <div className="app-liquid-card relative rounded-lg border border-border bg-background p-2">
              <img
                src={resolvedImages[0].src}
                alt={resolvedImages[0].alt || t('courseEditorForms.image', { count: 1 })}
                className="max-h-[260px] w-full rounded-md object-contain"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 h-8 w-8 bg-background/80 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleRemoveImage(0)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {resolvedImages.length >= 2 && (
            <div className="space-y-2">
              <ImageCarousel images={resolvedImages} />
              <CarouselImageOrder
                images={resolvedImages.map((img, idx) => ({
                  id: `${img.src}-${idx}`,
                  src: img.src,
                  alt: img.alt,
                }))}
                onMove={handleMoveImage}
                onRemove={handleRemoveImage}
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Column */}
          <div className="flex-1 space-y-8">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold">{t('courseEditorForms.question')}</h3>
              </div>
              <RichTextEditor 
                content={state.questionHtml} 
                onChange={val => updateState(s => ({ ...s, questionHtml: val }))}
                minHeight="min-h-[120px]"
              />
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold">{t('courseEditorForms.problemExplanation')}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t('courseEditorForms.problemExplanationHint')}</p>
              </div>
              <RichTextEditor 
                content={state.explanationHtml} 
                onChange={val => updateState(s => ({ ...s, explanationHtml: val }))}
                minHeight="min-h-[120px]"
              />
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold">{t('courseEditorForms.problemAnswerList')}</h3>
                {state.type === 'numericalresponse' || state.type === 'stringresponse' ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('courseEditorForms.problemTextAnswerHint')}
                  </p>
                ) : state.type === 'optionresponse' ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('courseEditorForms.problemDropdownAnswerHint')}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('courseEditorForms.problemChoiceAnswerHint', { answer: state.type === 'multiplechoiceresponse' ? t('courseEditorForms.problemOneCorrectAnswer') : t('courseEditorForms.problemMultipleCorrectAnswers') })}
                  </p>
                )}
              </div>
              
              <div className="space-y-3 p-1">
                {state.type === 'numericalresponse' || state.type === 'stringresponse' ? (
                  state.choices.map((choice, i) => (
                    <div key={choice.id} className="flex gap-4 items-center group">
                      <div className="pt-0.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded bg-[#c5e1a5] text-emerald-800">
                           <Check className="h-3.5 w-3.5 stroke-[3]" />
                        </div>
                      </div>
                      <div className="font-semibold text-[15px] w-5 text-center text-muted-foreground shrink-0">
                        {String.fromCharCode(65 + i)}
                      </div>
                      <div className="flex-1">
                        <input 
                          type="text" 
                          className="w-full flex h-10 rounded-md border border-input bg-background px-3 py-2 text-[15px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                          value={choice.html}
                          onChange={(e) => handleUpdateChoice(choice.id, { html: e.target.value })}
                          placeholder={state.type === 'numericalresponse' ? t('courseEditorForms.problemNumberAnswerPlaceholder') : t('courseEditorForms.problemTextAnswerPlaceholder')}
                        />
                      </div>
                      <div className="pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteChoice(choice.id)} disabled={state.choices.length <= 1}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : state.type === 'optionresponse' ? (
                  state.choices.map((choice, i) => (
                    <div key={choice.id} className="flex gap-4 items-start group">
                      <div className="pt-[14px]">
                        <input
                          type="radio"
                          name="correct-answer"
                          checked={choice.correct}
                          onChange={e => {
                            updateState(s => ({
                              ...s,
                              choices: s.choices.map(c => c.id === choice.id ? { ...c, correct: true } : { ...c, correct: false })
                            }));
                          }}
                          className="w-5 h-5 rounded-full border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </div>
                      <div className="pt-[15px] font-semibold w-5 text-center text-[15px] text-muted-foreground shrink-0">
                        {String.fromCharCode(65 + i)}
                      </div>
                      <div className="flex-1">
                        <textarea 
                          className="w-full flex min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-[15px] ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 resize-y"
                          value={choice.html}
                          onChange={(e) => handleUpdateChoice(choice.id, { html: e.target.value })}
                          placeholder={t('courseEditorForms.problemDropdownOptionPlaceholder')}
                        />
                      </div>
                      <div className="pt-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteChoice(choice.id)} disabled={state.choices.length <= 1}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  state.choices.map((choice, i) => (
                    <div key={choice.id} className="flex gap-4 items-start group">
                      <div className="pt-[14px]">
                        <input
                          type={state.type === 'choiceresponse' ? 'checkbox' : 'radio'}
                          name="correct-answer"
                          checked={choice.correct}
                          onChange={e => {
                            if (state.type === 'multiplechoiceresponse') {
                              updateState(s => ({
                                ...s,
                                choices: s.choices.map(c => c.id === choice.id ? { ...c, correct: true } : { ...c, correct: false })
                              }));
                            } else {
                              handleUpdateChoice(choice.id, { correct: e.target.checked });
                            }
                          }}
                          className="w-5 h-5 rounded-sm border-gray-300 text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </div>
                      <div className="pt-[15px] font-semibold w-5 text-center text-[15px] text-muted-foreground shrink-0">
                        {String.fromCharCode(65 + i)}
                      </div>
                      <div className="flex-1">
                        <RichTextEditor 
                          content={choice.html} 
                          onChange={val => handleUpdateChoice(choice.id, { html: val })}
                          minHeight="min-h-[44px]"
                          hideToolbar={true}
                        />
                      </div>
                      <div className="pt-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteChoice(choice.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
                
                <div className="pt-2">
                  <Button variant="ghost" className="text-sm font-semibold pl-2 hover:bg-primary/5 hover:text-primary" onClick={handleAddChoice}>
                    <Plus className="w-4 h-4 mr-2" /> {state.type === 'numericalresponse' || state.type === 'stringresponse' ? t('courseEditorForms.addAnswer') : t('courseEditorForms.addChoice')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-72 shrink-0 space-y-6">
            <div className="app-liquid-card border border-border rounded-xl p-4 bg-muted/10 space-y-3">
              <label className="text-sm font-semibold text-primary">{t('courseEditorForms.hints')}</label>
              <div className="space-y-2">
                {state.hints.map((hint, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input 
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={hint} 
                      onChange={e => handleUpdateHint(i, e.target.value)} 
                    />
                    <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteHint(i)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="ghost" className="w-full text-sm font-semibold hover:bg-primary/5 hover:text-primary mt-1" onClick={handleAddHint}>
                <Plus className="w-4 h-4 mr-2" /> {t('courseEditorForms.addHint')}
              </Button>
            </div>
          </div>
        </div>
    </div>
  );
}
