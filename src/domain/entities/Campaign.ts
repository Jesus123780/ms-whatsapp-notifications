export interface CampaignProps {
  id?: number;
  name: string;
  message: string;
  imagePath: string;
  createdAt?: Date;
}

export class Campaign {
  readonly id?: number;
  readonly name: string;
  readonly message: string;
  readonly imagePath: string;
  readonly createdAt: Date;

  constructor(props: CampaignProps) {
    this.id = props.id;
    this.name = props.name;
    this.message = props.message;
    this.imagePath = props.imagePath;
    this.createdAt = props.createdAt ?? new Date();
  }
}
