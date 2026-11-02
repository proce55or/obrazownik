import type { Attempt } from '../shared/schemas.js';
export interface Card {
  id: string; version: number; family: Attempt['family']; partition: Attempt['partition'];
  prompt: Attempt['promptSnapshot']; constraints: string[];
}
export const cards: Card[] = [{
  id: 'property-stone-01', version: 1, family: 'property', partition: 'training',
  prompt: { title: 'Ciepło w dłoni', stimulus: 'Kamień', instruction: 'Pomyśl o kamieniu trzymanym w dłoni. Zauważ do trzech jego cech: dotyk, ciężar, temperaturę. Wybierz jedną i zbuduj z niej krótki obraz w jednym lub dwóch zdaniach.' },
  constraints: ['Jedna cecha i jedno zdanie też wystarczą.'],
}];
export function getCard(id: string): Card | undefined { return cards.find(c => c.id === id); }
