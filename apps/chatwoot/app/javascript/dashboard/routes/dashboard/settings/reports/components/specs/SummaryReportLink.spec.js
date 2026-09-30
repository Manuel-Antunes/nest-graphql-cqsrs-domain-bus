import { mount } from '@vue/test-utils';
import SummaryReportLink from '../SummaryReportLink.vue';

vi.mock('dashboard/composables/useAppNavigation', () => ({
  useAppNavigation: () => ({
    resolvePath: to =>
      typeof to === 'string'
        ? to
        : `/app/accounts/1/reports/${to.name}/${to.params.id}`,
    isInertiaTarget: () => false,
  }),
}));

describe('SummaryReportLink', () => {
  it.each(['team', 'agent', 'inbox', 'label'])(
    'preserves the current query when opening a %s report',
    type => {
      const query =
        'from=1786147200&to=1788739199&range=last30days&business_hours=true&group_by=2&unrelated=keep';
      window.history.replaceState({}, '', `/app/accounts/1/reports?${query}`);

      const wrapper = mount(SummaryReportLink, {
        props: { row: { original: { id: 7, name: 'Support', type } } },
      });

      expect(wrapper.get('a').attributes('href')).toBe(
        `/app/accounts/1/reports/${type}_reports_show/7?${query}`
      );
      expect(wrapper.text()).toBe('Support');
      wrapper.unmount();
    }
  );
});
