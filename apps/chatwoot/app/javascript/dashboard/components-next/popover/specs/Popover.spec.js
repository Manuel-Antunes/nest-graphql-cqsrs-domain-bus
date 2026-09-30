import { flushPromises, mount } from '@vue/test-utils';
import { h, ref } from 'vue';
import Popover from '../Popover.vue';

const belowMd = ref(false);

vi.mock('dashboard/composables/store', () => ({
  useMapGetter: () => ref(false),
}));

vi.mock('@vueuse/core', async importOriginal => ({
  ...(await importOriginal()),
  useBreakpoints: () => ({ smaller: () => belowMd }),
}));

describe('Popover', () => {
  let wrapper;

  const mountPopover = (props = {}) => {
    wrapper = mount(Popover, {
      props,
      slots: {
        default: '<button data-test="trigger">Open</button>',
        content: params =>
          h(
            'button',
            { 'data-test': 'panel-action', onClick: params.hide },
            'Panel'
          ),
      },
      attachTo: document.body,
    });
    return wrapper;
  };

  const trigger = () => wrapper.find('[data-test="trigger"]');
  const content = () => document.body.querySelector('[data-popover-content]');
  const backdrop = () => document.body.querySelector('[data-popover-backdrop]');
  const panelAction = () =>
    document.body.querySelector('[data-test="panel-action"]');

  const settle = async () => {
    await flushPromises();
    await new Promise(resolve => {
      setTimeout(resolve, 0);
    });
    await flushPromises();
  };

  const openPopover = async () => {
    await trigger().trigger('click');
    await settle();
  };

  const pointerDown = target =>
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

  const pressEscape = target =>
    (target || document).dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );

  beforeEach(() => {
    belowMd.value = false;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();

        unobserve = vi.fn();

        disconnect = vi.fn();
      }
    );
  });

  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  describe('rendering and toggling', () => {
    it('renders the trigger slot and keeps the content hidden initially', () => {
      mountPopover();
      expect(trigger().exists()).toBe(true);
      expect(content()).toBeNull();
      expect(backdrop()).toBeNull();
    });

    it('opens on trigger click and emits show', async () => {
      mountPopover();
      await openPopover();
      expect(content()).not.toBeNull();
      expect(backdrop()).toBeNull();
      expect(wrapper.emitted('show')).toHaveLength(1);
      expect(wrapper.emitted('hide')).toBeUndefined();
    });

    it('renders the content slot inside the popover', async () => {
      mountPopover();
      await openPopover();
      expect(content().contains(panelAction())).toBe(true);
    });

    it('closes on a second trigger click and emits hide exactly once', async () => {
      mountPopover();
      await openPopover();
      await trigger().trigger('click');
      await settle();
      expect(content()).toBeNull();
      expect(wrapper.emitted('hide')).toHaveLength(1);
    });
  });

  describe('content slot hide', () => {
    it('closes when the slot invokes the provided hide function', async () => {
      mountPopover();
      await openPopover();
      panelAction().click();
      await settle();
      expect(content()).toBeNull();
      expect(wrapper.emitted('hide')).toHaveLength(1);
    });
  });

  describe('exposed methods', () => {
    it('opens via show and closes via hide', async () => {
      mountPopover();
      wrapper.vm.show();
      await settle();
      expect(content()).not.toBeNull();
      wrapper.vm.hide();
      await settle();
      expect(content()).toBeNull();
      expect(wrapper.emitted('show')).toHaveLength(1);
      expect(wrapper.emitted('hide')).toHaveLength(1);
    });

    it('toggles via toggle', async () => {
      mountPopover();
      wrapper.vm.toggle();
      await settle();
      expect(content()).not.toBeNull();
      wrapper.vm.toggle();
      await settle();
      expect(content()).toBeNull();
    });

    it('does not emit hide when already closed', async () => {
      mountPopover();
      wrapper.vm.hide();
      await settle();
      expect(wrapper.emitted('hide')).toBeUndefined();
    });
  });

  describe('escape key', () => {
    it('closes on Escape while open', async () => {
      mountPopover();
      await openPopover();
      pressEscape();
      await settle();
      expect(content()).toBeNull();
      expect(wrapper.emitted('hide')).toHaveLength(1);
    });

    it('does nothing on Escape while closed', async () => {
      mountPopover();
      await settle();
      pressEscape();
      await settle();
      expect(wrapper.emitted('hide')).toBeUndefined();
    });

    it('closes on Escape pressed inside its own content', async () => {
      mountPopover();
      await openPopover();
      pressEscape(panelAction());
      await settle();
      expect(content()).toBeNull();
    });

    it('stays open on Escape pressed inside a nested overlay', async () => {
      mountPopover();
      await openPopover();
      const overlay = document.createElement('dialog');
      overlay.className = 'ProseMirror-prompt-backdrop';
      document.body.appendChild(overlay);
      pressEscape(overlay);
      await settle();
      expect(content()).not.toBeNull();
      expect(wrapper.emitted('hide')).toBeUndefined();
    });
  });

  describe('click outside', () => {
    it('closes when clicking outside', async () => {
      mountPopover();
      await openPopover();
      pointerDown(document.body);
      await settle();
      expect(content()).toBeNull();
      expect(wrapper.emitted('hide')).toHaveLength(1);
    });

    it('stays open when clicking inside the content', async () => {
      mountPopover();
      await openPopover();
      pointerDown(panelAction());
      await settle();
      expect(content()).not.toBeNull();
      expect(wrapper.emitted('hide')).toBeUndefined();
    });

    it('stays open when clicking inside a nested overlay', async () => {
      mountPopover();
      await openPopover();
      const overlay = document.createElement('div');
      overlay.setAttribute('data-popover-content', '');
      document.body.appendChild(overlay);
      pointerDown(overlay);
      await settle();
      expect(content()).not.toBeNull();
      expect(wrapper.emitted('hide')).toBeUndefined();
    });
  });

  describe('mobile view', () => {
    it('renders a centered modal with backdrop below the md breakpoint', async () => {
      belowMd.value = true;
      mountPopover();
      await openPopover();
      expect(backdrop()).not.toBeNull();
      expect(content().contains(panelAction())).toBe(true);
    });

    it('keeps the anchored popover below md when disableMobileView is set', async () => {
      belowMd.value = true;
      mountPopover({ disableMobileView: true });
      await openPopover();
      expect(backdrop()).toBeNull();
      expect(content()).not.toBeNull();
    });
  });

  describe('close on scroll', () => {
    const scrollWithTriggerMovedBy = async offset => {
      await openPopover();
      trigger().element.parentElement.getBoundingClientRect = () => ({
        top: offset,
      });
      document.dispatchEvent(new Event('scroll'));
      await settle();
    };

    it('closes when the trigger drifts beyond the threshold', async () => {
      mountPopover();
      await scrollWithTriggerMovedBy(100);
      expect(content()).toBeNull();
      expect(wrapper.emitted('hide')).toHaveLength(1);
    });

    it('stays open for small drift within the threshold', async () => {
      mountPopover();
      await scrollWithTriggerMovedBy(10);
      expect(content()).not.toBeNull();
    });

    it('stays open when closeOnScroll is disabled', async () => {
      mountPopover({ closeOnScroll: false });
      await scrollWithTriggerMovedBy(100);
      expect(content()).not.toBeNull();
    });
  });
});
