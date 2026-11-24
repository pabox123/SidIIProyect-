import { Link } from 'react-router-dom';
import type { ContentCard as Card } from '../api/types';
import { ageLabel, TYPE_LABEL } from '../utils/format';
import { Badge, Cover } from './ui';

export function ContentCard({ item, extra }: { item: Card; extra?: React.ReactNode }) {
  return (
    <Link to={`/title/${item.contentId}`} className="card">
      <Cover url={item.coverUrl} title={item.title} type={item.type} />
      <div className="card-body">
        <h3 title={item.title}>{item.title}</h3>
        <div className="card-meta">
          <span>{TYPE_LABEL[item.type]}</span>
          <span>{item.releaseYear}</span>
          <Badge>{ageLabel(item.ageRating)}</Badge>
        </div>
        {extra}
      </div>
    </Link>
  );
}
