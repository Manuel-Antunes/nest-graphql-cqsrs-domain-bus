import { Mail } from '@nestposts/mail/mail';

import { PostCreatedEmail } from './templates/post-created.email';

export interface PostCreatedMailPost {
  title: string;
  url: string;
}

export interface PostCreatedMailRecipient {
  address: string;
  name: string | null;
}

export class PostCreatedNotificationMail extends Mail {
  constructor(
    private readonly post: PostCreatedMailPost,
    private readonly recipient: PostCreatedMailRecipient,
  ) {
    super();
  }

  prepare(): void {
    this.message
      .to(this.recipient.address, this.recipient.name ?? undefined)
      .subject(`Your post “${this.post.title}” is live`)
      .view(PostCreatedEmail, {
        authorName: this.recipient.name,
        title: this.post.title,
        url: this.post.url,
      });
  }
}
