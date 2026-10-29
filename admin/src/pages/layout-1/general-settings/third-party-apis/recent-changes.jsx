import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useGetIntegrationChangesQuery } from '@/features/integrations/integrationsApi';

const formatDate = (value) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const describe = (change) => {
  const fields = change.fields.join(', ');
  if (change.action === 'reset') {
    return fields ? `Reset to the server values (${fields})` : 'Reset to the server values';
  }
  return `Changed: ${fields}`;
};

// Who changed which keys, and when. The values themselves are never recorded,
// here or on the server: only which fields were touched.
export default function RecentChanges() {
  const { data: changes = [], isLoading } = useGetIntegrationChangesQuery();

  return (
    <Card>
      <CardHeader>
        <div className="space-y-1.5 py-4">
          <CardTitle>Recent changes</CardTitle>
          <CardDescription>
            Every change to these keys, with who made it. If one is here that
            nobody remembers making, change your password and the key.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {changes.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            {isLoading
              ? 'Loading…'
              : 'No key has been changed from this panel yet.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-5">When</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>What</TableHead>
                <TableHead className="pe-5">By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {changes.map((change) => (
                <TableRow key={change.id}>
                  <TableCell className="whitespace-nowrap ps-5">
                    {formatDate(change.at)}
                  </TableCell>
                  <TableCell className="font-medium">{change.name}</TableCell>
                  <TableCell>{describe(change)}</TableCell>
                  <TableCell className="pe-5">
                    <div>{change.actorName}</div>
                    <div className="text-xs text-muted-foreground">
                      {change.actorEmail}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
