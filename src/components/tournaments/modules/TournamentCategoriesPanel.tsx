import React from "react";
import ManageTournamentEvents, {
  TournamentSummary,
} from "../ManageTournamentEvents";

interface Props {
  tournament: TournamentSummary;
}

const TournamentCategoriesPanel: React.FC<Props> = ({ tournament }) => {
  return (
    <div className="space-y-6">
      <div className="rounded border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
        Use category presets to quickly populate the full slate of events and
        fine-tune registration details for {tournament.name}. Once categories
        are configured, players will be able to register for their preferred
        divisions and appear in fixture generation.
      </div>
      <ManageTournamentEvents tournament={tournament} />
    </div>
  );
};

export default TournamentCategoriesPanel;
