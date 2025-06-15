import Document from '@tiptap/extension-document';
import History from '@tiptap/extension-history';
import Paragraph from '@tiptap/extension-paragraph';
import Placeholder from '@tiptap/extension-placeholder';
import { default as TipTapText } from '@tiptap/extension-text';
import { Editor, JSONContent, useEditor } from '@tiptap/react';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { v4 } from 'uuid';
import { ContextItemWithId, InputModifiers, RangeInFile } from '@shared/core';
import { FigmaBasicInfo, FigmaMetaInfo } from '@shared/core/protocol/core';
import { SocketState } from '@shared/types/globalStore';
import { ChatState, NewThreadType, ThreadType, UserOrg } from '@shared/types/threads';
import { handleImageFile } from '@shared/utils/image';
import { assertNotNull } from '@shared/utils/null';
import { getBasename, getRelativePath } from '@shared/utils/pathUtils';
import { useIdeMessenger } from '@ui/context/IdeMessenger';
import { SubmenuContextProvidersContext } from '@ui/context/SubmenuContextProviders';
import { useErrorBoundary } from 'react-error-boundary';
import { VscEdit } from 'react-icons/vsc';
import useHistory from '../../hooks/useHistory';
import { useInputHistory } from '../../hooks/useInputHistory';
import useUpdatingRef from '../../hooks/useUpdatingRef';
import { useWebviewListener, useWebviewListenerWithoutResponding } from '../../hooks/useWebviewListener';
import { useCode } from '../CodeProvider';
import { useGlobalStore } from '../GlobalStoreProvider';
import FigmaInput from '../Prompt/figmaInput';
import Thumbnail from '../Thumbnail/ThumbnailManager';
import { CodegenFlowState, FigmaModal } from '../pages/chat';
import { CodeBlockExtension } from './CodeBlockExtension';
import { CustomImage } from './ImageExtension';
import { InputActionButton } from './InputActions';
import { Mention } from './MentionExtension';
import TipTapEditor from './TipTapEditor';
import { closeSuggestionPopup, getContextProviderDropdownOptions } from './getSuggestion';
import RestoreButton from '../RestoreButton/RestoreButton';
import { lineHeight } from '@ui/css/typography';
import { SuggestedPromptEditorContent } from '../Home/SelfServeHome';

export interface ChatInputBoxProps {
  isLastUserInput: boolean;
  currentOpenFigmaModal: FigmaModal | null;
  isMainInput: boolean;
  : (editorState: JSONContent, modifiers: InputModifiers, editor: Editor) => void;
  setFigmaModalOpen: (modal: FigmaModal) => void;
  editorState?: JSONContent;
  figmaError: string | null;
  currentThreadStatus?: 'generating' | 'successful' | 'error' | null;
  contextItems?: ContextItemWithId[];
  setCodegenFlowState: (codegenFlowState: CodegenFlowState) => void;
  onFigmaFetch: (figmaInfo: FigmaBasicInfo, link: string) => void;
  figmaLink: string;
  codegenFlowState: CodegenFlowState | null;
  setFigmaLink: (figmaLink: string) => void;
  onCloseFigma: () => void;
  onAddFigma: (editor: Editor) => Promise<FigmaMetaInfo & { link: string; id: string }>;
  figmaDetailLoading: boolean;
  disableChatDueToPreview: boolean;
  hidden?: boolean;
  attachOnAddCodeHandler?: (handler: (codeItem: ContextItemWithId) => void) => void;
  canRestore?: boolean;
  openRestoreConfirmModal?: () => void;
  isEditable: boolean;
  chatState?: ChatState;
  isAssistantInPlanningStage: boolean;
  suggestedPromptEditorContent?: SuggestedPromptEditorContent | null;
}

const PromptContainerWrapper = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isFocused'].includes(prop),
})<{
  isFocused?: boolean;
}>`
  border-radius: ${(props) => props.theme.borderRadius.md};
  padding: 1px; // for gradient border
  background: ${(props) =>
    props.isFocused ? 'linear-gradient(to right, #0243a6, #77adff)' : props.theme.colors.background.inputBackground};
`;

const PromptContainer = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isMainInput', 'chatState'].includes(prop),
})<{
  isMainInput?: boolean;
  isEditorDisabled?: boolean;
  chatState?: ChatState;
}>`
  width: 100%;
  display: flex;
  flex-direction: column;
  border-radius: ${(props) => props.theme.borderRadius.md};
  position: relative;
  opacity: ${(props) => (props.chatState === ChatState.CODE_REVIEW ? 0 : props.isEditorDisabled ? 0.5 : 1)};
  pointer-events: ${(props) => (props.isEditorDisabled ? 'none' : 'auto')};
  background-color: ${(props) => props.theme.colors.background.inputBackground};
`;

const InputActionButtonsWrapper = styled.div`
  position: absolute;
  top: -9px;
  right: 8px;
  z-index: 999;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ChatInputBoxContainer = styled.div.withConfig({
  shouldForwardProp: (prop) => !['isFocused'].includes(prop),
})<{
  isFocused?: boolean;
}>`
  display: flex;
  position: relative;
  border-radius: ${(props) => props.theme.borderRadius.md};
`;

function ChatInputBox(props: ChatInputBoxProps) {
  const active = false;
  const { currentThread, fetchingHistory } = useHistory();
  const [isRefreshSent, setIsRefreshSent] = useState(false);

  const threadTypeRef = useUpdatingRef(currentThread.threadType);

  const ideMessenger = useIdeMessenger();
  const { getSubmenuContextItems } = useContext(SubmenuContextProvidersContext);

  const { availableContextProviders, loading, initNewThread } = useCode();

  const inSubmenuRef = useRef<string | undefined>(undefined);
  const inDropdownRef = useRef(false);
  const useActiveFile = false;
  const {
    storeData: {
      extensionInternalStates: { socketState },
      authDetails: { userDetails },
      subscriptionInfo,
    },
  } = useGlobalStore();

  const activeRef = useUpdatingRef(active);
  const editorContentRef = useRef<JSONContent | null>(null);

  const getSubmenuContextItemsRef = useUpdatingRef(getSubmenuContextItems);
  const availableContextProvidersRef = useUpdatingRef(availableContextProviders);

  const historyLength = /* useSelector((store: RootState) => store.state.history.length); */ 0;

  const historyLengthRef = useUpdatingRef(currentThread.history);
  // const availableSlashCommandsRef = useUpdatingRef<ComboBoxItem[]>(availableSlashCommands);

  const historyKey = 'chat';
  const { showBoundary } = useErrorBoundary();
  const { prevRef, nextRef, addRef } = useInputHistory(historyKey);

  const disableChatDueToRefactorMention = useMemo(() => {
    if (props.editorState && props.editorState.content) {
      let isRefactorMentionedInChat = false;
      assertNotNull(props.editorState.content).forEach((c) => {
        if (isRefactorMentionedInChat) return;
        if (c.type === 'paragraph' && c.content) {
          c.content.forEach((node) => {
            if (node.type === 'mention' && node.attrs && node.attrs.itemType === 'refactorPrompt') {
              isRefactorMentionedInChat = true;
              return;
            }
          });
        }
      });
      return isRefactorMentionedInChat;
    }
    return false;
  }, [props.editorState]);

  const disableChatDueToImage = useMemo(() => {
    if (props.editorState && props.editorState.content) {
      return props.editorState.content.some((c) => c.type === 'image');
    }
    return false;
  }, [props.editorState]);

  const enterSubmenu = async (editor: Editor, providerId: string) => {
    const contents = editor.getText();
    const indexOfAt = contents.lastIndexOf('@');
    if (indexOfAt === -1) {
      return;
    }

    // Find the position of the last @ character
    // We do this because editor.getText() isn't a correct representation including node views
    let startPos = editor.state.selection.anchor;
    while (startPos > 0 && editor.state.doc.textBetween(startPos, startPos + 1) !== '@') {
      startPos--;
    }
    startPos++;

    editor.commands.deleteRange({
      from: startPos,
      to: editor.state.selection.anchor,
    });
    inSubmenuRef.current = providerId;

    // to trigger refresh of suggestions
    editor.commands.insertContent(':');
    editor.commands.deleteRange({
      from: editor.state.selection.anchor - 1,
      to: editor.state.selection.anchor,
    });
  };

  const onClose = () => {
    inSubmenuRef.current = undefined;
    inDropdownRef.current = false;
  };

  const onOpen = () => {
    inDropdownRef.current = true;
  };

  const onImageFileSelected = (file: File) => {
    if (!editor) return;
    handleImageFile(file, ideMessenger).then((result: [HTMLImageElement, string] | undefined) => {
      if (!result) return;
      const dataUrl = result[1];
      editor.chain().focus().setImage({ src: dataUrl, alt: file.name, id: v4() }).run();
    });
  };

  const [isEditorFocused, setIsEditorFocused] = useState(false);

  const editor: Editor = useEditor(
    {
      extensions: [
        Document,
        History,
        CustomImage.configure({
          pasteHandler: handleImageFile,
        }),
        Placeholder.configure({
          placeholder: "Ask anything - use '@' to add context",
        }),
        Paragraph.extend({
          addKeyboardShortcuts() {
            return {
              Enter: () => {
                if (inDropdownRef.current) {
                  return false;
                }

                onEnterRef.current({
                  useCodebase: false,
                  noContext: !useActiveFile,
                });

                return true;
              },

              'Mod-Enter': () => {
                onEnterRef.current({
                  useCodebase: true,
                  noContext: !useActiveFile,
                });
                return true;
              },
              'Alt-Enter': () => {
                onEnterRef.current({
                  useCodebase: false,
                  noContext: useActiveFile,
                });

                return true;
              },
              'Mod-Backspace': () => {
                // If you press cmd+backspace wanting to cancel,
                // but are inside of a text box, it shouldn't
                // delete the text
                if (activeRef.current) {
                  return true;
                }
                return false;
              },
              'Shift-Enter': () =>
                this.editor.commands.first(({ commands }) => [
                  () => commands.newlineInCode(),
                  () => commands.createParagraphNear(),
                  () => commands.liftEmptyBlock(),
                  () => commands.splitBlock(),
                ]),

              ArrowUp: () => {
                if (this.editor.state.selection.anchor > 1) {
                  return false;
                }

                const previousInput = prevRef.current(this.editor.state.toJSON().doc);
                if (previousInput) {
                  this.editor.commands.setContent(previousInput);
                  setTimeout(() => {
                    this.editor.commands.blur();
                    this.editor.commands.focus('start');
                  }, 0);
                  return true;
                }
                return false;
              },
              ArrowDown: () => {
                if (this.editor.state.selection.anchor < this.editor.state.doc.content.size - 1) {
                  return false;
                }
                const nextInput = nextRef.current();
                if (nextInput) {
                  this.editor.commands.setContent(nextInput);
                  setTimeout(() => {
                    this.editor.commands.blur();
                    this.editor.commands.focus('end');
                  }, 0);
                  return true;
                }
                return false;
              },
            };
          },
        }).configure({
          HTMLAttributes: {
            class: 'my-[4px] pr-[24px]',
          },
        }),
        TipTapText,
        availableContextProviders.length
          ? Mention.configure({
              HTMLAttributes: {
                class: 'mention',
              },
              suggestion: getContextProviderDropdownOptions(
                availableContextProvidersRef,
                getSubmenuContextItemsRef,
                enterSubmenu,
                onClose,
                onOpen,
                inSubmenuRef,
                ideMessenger,
                () => props.onAddFigma(editorRef.current),
                editorContentRef,
              ),
              renderHTML: (props) => `@${props.node.attrs.label || props.node.attrs.id}`,
            })
          : undefined,
        // availableSlashCommands.length && userDetails?.orgName === UserOrg.MT //slash command is only available for MT org now
        //   ? SlashCommand.configure({
        //       HTMLAttributes: {
        //         class: 'mention',
        //       },
        //       suggestion: getSlashCommandDropdownOptions(availableSlashCommandsRef, onClose, onOpen, ideMessenger),
        //       renderText: (props) => {
        //         return props.node.attrs.label;
        //       },
        //     })
        //   : undefined,
        CodeBlockExtension,
      ].filter((v) => v !== undefined),
      content: props.editorState /* || mainEditorContent */ || '',
      onFocus: () => setIsEditorFocused(true),
      onBlur: () => setIsEditorFocused(false),
    },
    [availableContextProviders],
  )!;

  useEffect(() => {
    if (loading && props.isMainInput) {
      editor.commands.clearContent(true);
    }
  }, [loading, props.isMainInput, editor]);

  // update editor states reactively, pass dependencies to useEditor
  // very carefully, because that creates a few editor instance with
  // everything initialized to their init values

  const editorRef = useUpdatingRef(editor, [editor]);

  const isFigmaMentionedInInput = useMemo(() => {
    const content = editor.getJSON().content;
    if (!content) return false;
    return content.some((c) => {
      if (c.type === 'paragraph' && c.content) {
        return c.content.some((c) => {
          return c.type === 'mention' && c.attrs?.itemType === 'figma';
        });
      }
    });
  }, [editor.getJSON().content]);

  // this is to disable the component version selector if a figma mention is present in the main input
  const isFigmaMentionedInMainInput = useMemo(() => {
    if (!props.isMainInput) return false;
    return isFigmaMentionedInInput;
  }, [isFigmaMentionedInInput, props.isMainInput]);

  const disableChatDueToFigma = useMemo(() => {
    if (!userDetails?.canCustomizeCodegen && isFigmaMentionedInInput) {
      return true;
    }
    return false;
  }, [userDetails?.canCustomizeCodegen, isFigmaMentionedInInput]);

  const isEditorDisabled = useMemo(() => {
    return (
      loading ||
      props.disableChatDueToPreview ||
      subscriptionInfo?.remainingCredits === 0 ||
      fetchingHistory ||
      (props.isMainInput && currentThread.blockThread) ||
      (!props.isMainInput && (disableChatDueToRefactorMention || disableChatDueToFigma)) ||
      socketState !== SocketState.Connected ||
      !props.isEditable
    );
  }, [
    loading,
    fetchingHistory,
    socketState,
    disableChatDueToRefactorMention,
    props.isMainInput,
    props.disableChatDueToPreview,
    props.isEditable,
    currentThread.blockThread,
    subscriptionInfo?.remainingCredits,
  ]);

  useEffect(() => {
    const isEditable = (props.isMainInput && props.isEditable) || !isEditorDisabled;
    editor.setEditable(isEditable);
    editor.setOptions({
      editorProps: {
        attributes: {
          class: 'outline-none -mt-1 overflow-hidden',
          style: `cursor: ${!isEditable ? 'not-allowed' : 'text'}; font-size: var(--font-size-sm); line-height: ${lineHeight('md')};`,
        },
        handleDOMEvents: {
          keydown: (_view, event) => {
            if (event.key === 'Enter' && !event.metaKey && props.codegenFlowState !== CodegenFlowState.Customise) {
              event.stopPropagation();
            }
            return false; // let TipTap continue handling Enter
          },
        },
      },
    });
  }, [editor, isEditorDisabled, props.codegenFlowState]);

  useEffect(() => {
    editor.extensionManager.extensions.forEach((extension) => {
      if (props.isMainInput) {
        if (extension.name === 'placeholder') {
          if (currentThread.blockThread) {
            extension.options.placeholder = 'Unfotunately, You can not continue this thread.';
          } else {
            if (props.isAssistantInPlanningStage) {
              extension.options.placeholder = 'Want to change the plan? Describe the changes you want to make...';
            } else if (historyLengthRef.current.length == 0) {
              extension.options.placeholder = "Ask anything - use '@' to add context";
            } else {
              extension.options.placeholder = 'Ask a follow-up';
            }
          }
        }
        editor.chain().focus().run();
      } else {
        if (extension.name === 'placeholder') {
          extension.options.placeholder = 'Edit your follow-up';
        }
      }
    });
  }, [currentThread.history.length, editor, props.isAssistantInPlanningStage, currentThread.blockThread]);

  useEffect(() => {
    if (historyLengthRef.current.length > 0 && !loading && props.isMainInput) {
      editor.commands.focus('end');
    }
  }, [loading, props.isMainInput]);

  const sendRefreshCall = useUpdatingRef(
    (fromFigma?: boolean) => {
      const { codeGenerationSettings } = currentThread;
      if (
        props.isMainInput &&
        codeGenerationSettings.type === UserOrg.SELF_SERVE &&
        (!editor.isEmpty || fromFigma) &&
        !isRefreshSent
      ) {
        setIsRefreshSent(true);
        ideMessenger.post('command/refresh', {
          codeGenerationSettings,
          threadId: currentThread.threadId,
          enableSearchInWorkspace: codeGenerationSettings.enableSearchInWorkspace,
          messageType: threadTypeRef.current,
        });
        setTimeout(
          () => {
            setIsRefreshSent(false);
          },
          1000 * 60 * 3,
        );
      }
    },
    [editor, isRefreshSent, props.isMainInput],
  );

  useEffect(() => {
    const getEditorContent = () => {
      sendRefreshCall.current();

      const content = editor.getJSON();
      if (content) {
        editorContentRef.current = content;
      }
    };

    editor.on('update', getEditorContent);

    return () => {
      editor.off('update', getEditorContent);
    };
  }, [editor, isRefreshSent, props.isMainInput]);

  useEffect(() => {
    //focus the editor as soon as it's ready and if it's the main input
    if (editor && props.isMainInput) {
      editor.commands.focus('end');
    }
  }, [props.isMainInput, editor]);

  const onEnterRef = useUpdatingRef(
    async (modifiers: InputModifiers) => {
      try {
        if (active) {
          return;
        }
        if (isEditorDisabled) {
          return;
        }

        const json = editor.getJSON();
        if (isFigmaMentionedInMainInput && !userDetails?.canSelectThreadType) {
          await initNewThread({ type: NewThreadType.Empty, preserveState: true });
          props.setCodegenFlowState(CodegenFlowState.Customise);
          return;
        }

        // Don't do anything if input box is empty (but allow images without text)
        const hasImages = json.content?.some((c) => c.type === 'image');
        const hasTextContent =
          json.content?.some((c) => c.content) &&
          !json.content?.every(
            (c) => c.type === 'paragraph' && c.content?.every((c) => c.type === 'text' && c.text?.trim() === ''),
          );

        if (!hasImages && !hasTextContent) {
          return;
        }

        if (props.isMainInput) {
          editor.commands.clearContent(true);
          setTimeout(() => {
            editor.chain().blur().run();
          }, 20);
        }

        props.onEnter(json, modifiers, editor);

        if (props.isMainInput) {
          const content = editor.state.toJSON().doc;
          addRef.current(content);
        }
        setIsRefreshSent(false);
      } catch (e) {
        showBoundary(e);
      }
    },
    [props.onEnter, editor, props.isMainInput],
  );

  useWebviewListener(
    'highlightedCode',
    async (data) => {
      const rif: RangeInFile & { contents: string } = data.rangeInFileWithContents;
      const relativePath = getRelativePath(rif.filepath, await ideMessenger.ide.getWorkspaceDirs());
      const basename = getBasename(rif.filepath);

      const rangeStr = `(${rif.range.start.line + 1}-${rif.range.end.line + 1})`;

      const itemName = `${basename} ${rangeStr}`;
      const item: ContextItemWithId = {
        content: rif.contents,
        name: itemName,
        // Description is passed on to the LLM to give more context on file path
        description: `${relativePath} ${rangeStr}`,
        id: {
          providerTitle: 'code',
          itemId: v4(),
        },
        uri: {
          type: 'file',
          value: rif.filepath,
        },
      };

      let index = 0;
      if (editor.getJSON().content) {
        for (const el of assertNotNull(editor.getJSON().content)) {
          if (el.attrs?.item?.name === itemName) {
            return; // Prevent duplicate code blocks
          }
          if (el.type === 'codeBlock') {
            index += 2;
          } else {
            break;
          }
        }
      }
      editor
        .chain()
        .insertContentAt(index, {
          type: 'codeBlock',
          attrs: {
            item,
          },
        })
        .run();

      if (data.prompt) {
        editor.commands.focus('end');
        editor.commands.insertContent(data.prompt);
      }

      if (data.shouldRun) {
        onEnterRef.current({ useCodebase: false, noContext: true });
      }

      setTimeout(() => {
        editor.commands.blur();
        editor.commands.focus('end');
      }, 20);
      return { success: true };
    },
    [editor, props.isMainInput, historyLength, props.isMainInput, onEnterRef.current],
    !props.isMainInput || !editor,
  );

  useWebviewListener(
    'userInput',
    async (data) => {
      if (!props.isMainInput) {
        return;
      }
      if (data.promptInput && Array.isArray(data.promptInput)) {
        data.promptInput.map((node) => {
          const { nodeType, ...attrs } = node;
          switch (nodeType) {
            case 'codeBlock':
              editor
                .chain()
                .insertContentAt(0, {
                  type: 'codeBlock',
                  attrs: {
                    ...attrs,
                  },
                })
                .run();
              editor.commands.focus('end');
              break;
            case 'mention':
              editor.chain().focus().insertContent({ type: 'mention', attrs }).run();
              break;
            // case 'preview':
            // editor
            //   .chain()
            //   .focus()
            //   .insertContent({
            //     type: 'errorBlock',
            //     attrs: {
            //       ...attrs,
            //     },
            //   })
            //   .run();
            // break;
            default:
              editor
                .chain()
                .focus()
                .insertContent({ type: 'text', text: ` ${node.label} ` })
                .run();
          }
          return;
        });
      }
      setTimeout(() => {
        editor.commands.blur();
        editor.commands.focus('end');
      }, 20);
      onEnterRef.current({ useCodebase: false, noContext: true, refactor: data.operation });
    },
    [editor, onEnterRef.current, props.isMainInput],
  );

  useEffect(() => {
    if (props.currentOpenFigmaModal) {
      closeSuggestionPopup(onClose);
    }
  }, [props.currentOpenFigmaModal]);

  useEffect(() => {
    // for Ask option
    if (!editor || !props.attachOnAddCodeHandler) return;
    const onAddCode = (codeItem: ContextItemWithId) => {
      editor
        .chain()
        .insertContentAt(0, {
          type: 'codeBlock',
          attrs: { item: codeItem },
        })
        .run();
      setTimeout(() => {
        editor.commands.blur();
        editor.commands.focus('end');
      }, 20);
    };
    props.attachOnAddCodeHandler(onAddCode);
  }, [editor, props.attachOnAddCodeHandler]);

  const [chatBoxHovered, setChatBoxHovered] = useState<boolean>(false);

  useEffect(() => {
    if (!editor || !props.codegenFlowState) return;

    if (props.codegenFlowState === CodegenFlowState.AddLink) {
      editor.commands.blur();
    }
  }, [editor, props.codegenFlowState]);

  useWebviewListenerWithoutResponding('viewAccount', async () => {
    if (editor) editor.commands.blur();
  });

  return (
    <>
      {props.canRestore && editor && !props.isMainInput && props.openRestoreConfirmModal && (
        <RestoreButton
          onRestore={() => props.openRestoreConfirmModal && props.openRestoreConfirmModal()}
          disabled={fetchingHistory || loading}
        />
      )}
      <PromptContainerWrapper isFocused={isEditorFocused}>
        <PromptContainer
          className={`${props.hidden ? 'hidden' : ''}`}
          isMainInput={props.isMainInput}
          chatState={props.chatState}
        >
          {props.codegenFlowState !== CodegenFlowState.Customise && (
            <Thumbnail
              isMainInput={props.isMainInput || false}
              loading={props.figmaDetailLoading}
              editor={editor}
              disableImageRemoval={disableChatDueToImage}
              suggestedPromptEditorContent={props.suggestedPromptEditorContent}
            />
          )}

          <ChatInputBoxContainer
            className={`${props.chatState === ChatState.CODE_REVIEW ? 'h-0' : ''}`}
            isFocused={isEditorFocused}
          >
            <FigmaInput
              open={props.currentOpenFigmaModal === FigmaModal.Figma}
              editor={editor}
              error={props.figmaError}
              onEnterRef={onEnterRef}
              fetchingFigma={props.figmaDetailLoading}
              figmaLink={props.figmaLink}
              setFigmaLink={props.setFigmaLink}
              onClose={() => {
                props.onCloseFigma();
              }}
              onFigmaFetch={props.onFigmaFetch}
              isMainInput={props.isMainInput}
            />

            {editor && !loading && !props.isMainInput && chatBoxHovered && !isEditorDisabled && (
              <InputActionButtonsWrapper>
                <InputActionButton
                  onClick={() => {
                    editor.commands.focus('end');
                  }}
                  title="Edit"
                  disabled={disableChatDueToRefactorMention}
                  children={<VscEdit size={10} />}
                />
              </InputActionButtonsWrapper>
            )}
            <TipTapEditor
              onEnterRef={onEnterRef}
              editor={editor}
              shouldDisableInputToolbarActions={isEditorDisabled}
              isMainInput={props.isMainInput}
              availableContextProviders={availableContextProviders}
              availableSlashCommands={[]}
              onImageFileSelected={onImageFileSelected}
              toolbarOptions={{
                hideFigmaButton:
                  props.codegenFlowState === CodegenFlowState.Customise ||
                  (!userDetails?.canCustomizeCodegen && isFigmaMentionedInMainInput),
                disableComponentVersionSelector:
                  props.codegenFlowState === CodegenFlowState.Customise || isFigmaMentionedInMainInput,
              }}
              onAddFigma={async (...args) => {
                sendRefreshCall.current(true);
                return await props.onAddFigma(editorRef.current);
              }}
            />
          </ChatInputBoxContainer>
        </PromptContainer>
      </PromptContainerWrapper>
    </>
  );
}

export default ChatInputBox;