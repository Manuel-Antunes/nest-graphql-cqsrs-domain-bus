import { enableAutoUnmount, mount } from '@vue/test-utils';
import ContactNoteItem from '../ContactNoteItem.vue';

/**
 * Deleting a contact note used to fire on the first click, with no undo
 * (issue #555). The trash button now opens an AlertDialog, and `delete` is
 * emitted only from its confirm action.
 *
 * The assertions are on the EMIT rather than on the dialog's markup: the emit
 * is the contract the parent (`ContactNotes.vue`) acts on, and it is what
 * actually deletes the row. A test that only looked for a dialog in the DOM
 * would still pass if the button kept deleting behind it.
 */
const note = {
  id: 7,
  content: 'Cliente pediu retorno por WhatsApp.',
  createdAt: 1676332800,
  user: { name: 'John', thumbnail: '' },
};

// The dialog content is teleported to <body> and does NOT come down when the
// assertion ends, so without this the next test's query finds the previous
// test's confirm button — and clicks a button belonging to a dead wrapper.
// Unmount between tests, and start each one from an empty <body>: the dialog
// content is teleported there and does not come down with the assertion, so a
// leftover confirm button would otherwise be the one the next test clicks —
// on a wrapper that is already dead. Clearing in `beforeEach` (not `afterEach`)
// keeps the DOM intact for the auto-unmount that runs between tests.
enableAutoUnmount(afterEach);
beforeEach(() => {
  document.body.innerHTML = '';
});

const mountItem = (props = {}) =>
  mount(ContactNoteItem, {
    props: { note, writtenBy: 'John', allowDelete: true, ...props },
    global: {
      stubs: { Avatar: true, Icon: true },
    },
  });

const trashButton = wrapper => wrapper.find('button');

/** A button in the teleported dialog, found by its visible label. */
const dialogButton = label =>
  [...document.querySelectorAll('button')].find(
    button => button.textContent.trim() === label
  );

describe('ContactNoteItem', () => {
  it('does not emit delete when the trash button is clicked', async () => {
    const wrapper = mountItem();

    await trashButton(wrapper).trigger('click');

    expect(wrapper.emitted('delete')).toBeUndefined();
  });

  it('emits delete only after the dialog is confirmed', async () => {
    const wrapper = mountItem();

    await trashButton(wrapper).trigger('click');
    const confirm = dialogButton('Delete note');
    expect(confirm, 'the confirm action should be on screen').toBeTruthy();

    confirm.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('delete')).toHaveLength(1);
    expect(wrapper.emitted('delete')[0]).toEqual([note.id]);
  });

  it('does not emit delete when the dialog is cancelled', async () => {
    const wrapper = mountItem();

    await trashButton(wrapper).trigger('click');
    const cancel = dialogButton('Cancel');
    expect(cancel, 'the cancel action should be on screen').toBeTruthy();

    cancel.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('delete')).toBeUndefined();
  });

  it('renders no delete affordance at all when allowDelete is false', () => {
    const wrapper = mountItem({ allowDelete: false });

    expect(wrapper.find('button').exists()).toBe(false);
  });
});
