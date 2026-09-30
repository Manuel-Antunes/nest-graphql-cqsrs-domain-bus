interface CustomEventOptions {
  eventName: string;
  data?: unknown;
}

export const createEvent = ({
  eventName,
  data = null,
}: CustomEventOptions): CustomEvent => {
  let event: CustomEvent;
  if (typeof window.CustomEvent === 'function') {
    event = new CustomEvent(eventName, { detail: data });
  } else {
    event = document.createEvent('CustomEvent');
    event.initCustomEvent(eventName, false, false, data);
  }
  return event;
};

export const dispatchWindowEvent = ({
  eventName,
  data,
}: CustomEventOptions): void => {
  const event = createEvent({ eventName, data });
  window.dispatchEvent(event);
};
