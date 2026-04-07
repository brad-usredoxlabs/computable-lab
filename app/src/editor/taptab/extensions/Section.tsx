import { Node, mergeAttributes } from '@tiptap/core';

export const Section = Node.create({
  name: 'section',
  group: 'block',
  content: 'sectionHeading fieldRow+',
  defining: true,

  addAttributes() {
    return {
      title: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-type="taptab-section"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'taptab-section',
        class: 'taptab-section',
      }),
      0,
    ];
  },
});

export const SectionHeading = Node.create({
  name: 'sectionHeading',
  group: 'block',
  content: 'text*',
  defining: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'h3[data-type="taptab-section-heading"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'h3',
      mergeAttributes(HTMLAttributes, {
        contenteditable: 'false',
        'data-type': 'taptab-section-heading',
        class: 'taptab-section-heading',
      }),
      0,
    ];
  },
});
