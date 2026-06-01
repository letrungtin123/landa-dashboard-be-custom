import React, { useState, useEffect } from 'react';
import { HelpCircle, Check, Trash2, Plus, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from './VideoEditor';
import RichTextEditor from '../RichTextEditor';

// OLX Templates chính xác từ frontend-app-authoring
const PROBLEM_TYPES = [
  {
    id: 'multiplechoiceresponse',
    label: 'Trắc nghiệm 1 đáp án',
    desc: 'Chọn một đáp án đúng',
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
    label: 'Trắc nghiệm nhiều đáp án',
    desc: 'Chọn nhiều đáp án đúng',
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
    label: 'Danh sách thả xuống',
    desc: 'Chọn từ danh sách thả xuống',
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
    label: 'Điền số',
    desc: 'Nhập số (có sai số)',
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
    label: 'Điền văn bản',
    desc: 'Nhập văn bản tự do',
    boilerplate: 'string_response.yaml',
    template: `<problem>
  <stringresponse answer="đáp án đúng" type="ci">
    <label>Câu hỏi của bạn</label>
    <additional_answer answer="đáp án thay thế" />
    <textline size="30"/>
  </stringresponse>
</problem>`,
  },
];

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

export function parseProblemXml(xmlStr: string): ProblemState | null {
  if (!xmlStr || typeof xmlStr !== 'string' || xmlStr.trim() === '') return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'text/xml');
  
  const root = doc.querySelector('problem');
  if (!root) return null;

  const rootAttrs = Array.from(root.attributes).map(a => `${a.name}="${a.value}"`).join(' ');

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
    const choicesXml = state.choices.map(c => `      <choice correct="${c.correct ? 'true' : 'false'}">${c.html}</choice>`).join('\n');
    innerResponseXml = `    <${groupTag}>\n${choicesXml}\n    </${groupTag}>`;
  } else if (state.type === 'numericalresponse' || state.type === 'stringresponse') {
    const additionalAnswers = state.choices.slice(1).map(c => `    <additional_answer answer="${c.html.replace(/"/g, '&quot;')}" />`).join('\n');
    
    if (state.type === 'numericalresponse') {
      innerResponseXml = `${additionalAnswers ? additionalAnswers + '\n' : ''}${state.tolerance ? `    <responseparam type="tolerance" default="${state.tolerance.replace(/"/g, '&quot;')}" />\n` : ''}    <formulaequationinput />`;
    } else {
      innerResponseXml = `${additionalAnswers ? additionalAnswers + '\n' : ''}    <textline size="30"/>`;
    }
  } else if (state.type === 'optionresponse') {
    const optionsXml = state.choices.map(c => `      <option correct="${c.correct ? 'true' : 'false'}">${c.html.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</option>`).join('\n');
    innerResponseXml = `    <optioninput>\n${optionsXml}\n    </optioninput>`;
  }

  const responseAttrs = (state.type === 'numericalresponse' || state.type === 'stringresponse') 
    ? ` answer="${(state.choices[0]?.html || '').replace(/"/g, '&quot;')}"${state.type === 'stringresponse' ? ' type="ci"' : ''}` 
    : '';

  let solutionXml = '';
  const cleanExp = state.explanationHtml.trim();
  if (cleanExp && cleanExp !== '<p><br></p>') {
    solutionXml = `\n    <solution>\n<div class="detailed-solution">\n${state.explanationHtml}\n</div>\n    </solution>`;
  }

  let hintsXml = '';
  const validHints = state.hints.filter(h => h.trim());
  if (validHints.length > 0) {
    const hintsList = validHints.map(h => `      <hint>${h}</hint>`).join('\n');
    hintsXml = `\n    <demandhint>\n${hintsList}\n    </demandhint>`;
  }

  return `<problem${state.rootAttrs ? ' ' + state.rootAttrs : ''}>
${state.questionHtml}
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
  selectedBoilerplate?: string;
}

export default function ProblemEditor({
  displayName,
  onDisplayNameChange,
  problemXml,
  onXmlChange,
  selectedBoilerplate,
}: ProblemEditorProps) {

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

  const handleSelectType = (type: typeof PROBLEM_TYPES[0]) => {
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
          <Field label="Tên hiển thị">
            <input
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
              value={displayName}
              onChange={e => onDisplayNameChange(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Column */}
          <div className="flex-1 space-y-8">
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold">Câu hỏi</h3>
              </div>
              <RichTextEditor 
                content={state.questionHtml} 
                onChange={val => updateState(s => ({ ...s, questionHtml: val }))}
                minHeight="min-h-[120px]"
              />
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold">Giải thích (Đáp án)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Cung cấp lời giải chi tiết sau khi học viên trả lời</p>
              </div>
              <RichTextEditor 
                content={state.explanationHtml} 
                onChange={val => updateState(s => ({ ...s, explanationHtml: val }))}
                minHeight="min-h-[120px]"
              />
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold">Danh sách đáp án</h3>
                {state.type === 'numericalresponse' || state.type === 'stringresponse' ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Nhập (các) đáp án đúng bên dưới. Học viên phải nhập khớp một trong số các đáp án này.
                  </p>
                ) : state.type === 'optionresponse' ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Nhập các tùy chọn bên dưới và đánh dấu vào đáp án đúng.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Nhập các đáp án bên dưới và đánh dấu vào {state.type === 'multiplechoiceresponse' ? 'đáp án đúng' : 'các đáp án đúng'}.
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
                          placeholder={state.type === 'numericalresponse' ? 'Nhập số (VD: 100)' : 'Nhập văn bản đáp án đúng'}
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
                          placeholder="Nhập tùy chọn thả xuống..."
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
                    <Plus className="w-4 h-4 mr-2" /> {state.type === 'numericalresponse' || state.type === 'stringresponse' ? 'Thêm đáp án' : 'Thêm lựa chọn'}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-72 shrink-0 space-y-6">
            <div className="border border-border rounded-xl p-4 bg-muted/10 space-y-3">
              <label className="text-sm font-semibold text-primary">Gợi ý</label>
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
                <Plus className="w-4 h-4 mr-2" /> Thêm gợi ý
              </Button>
            </div>
          </div>
        </div>
    </div>
  );
}

export { PROBLEM_TYPES };
