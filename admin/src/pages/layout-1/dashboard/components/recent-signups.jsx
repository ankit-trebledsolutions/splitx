import { Link } from 'react-router';
import { formatDateTime, getInitials, timeAgo } from '@/lib/helpers';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Blocked outranks unverified: a blocked account cannot get in whether or not
// its email was ever confirmed, so that is the state worth showing.
const statusOf = (user) => {
  if (user.isActive === false) {
    return { label: 'Blocked', variant: 'destructive' };
  }
  if (user.emailVerified === false) {
    return { label: 'Unverified', variant: 'warning' };
  }
  return { label: 'Active', variant: 'success' };
};

// The newest app accounts. Only rendered for an admin who may see user
// records: for anyone else the server sends no list at all, and the page
// leaves this card out instead of showing it empty.
export default function RecentSignups({ users }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Recent sign-ups</CardTitle>
        <Button mode="link" asChild>
          <Link to="/users">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {/* A floor on the width, so a narrow screen scrolls the table sideways
            and does not crush the user column down to nothing. */}
        <Table className="min-w-[30rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="ps-5">User</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pe-5">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="px-5 py-8 text-center text-muted-foreground"
                >
                  Nobody has signed up yet.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const status = statusOf(user);
                const name = user.name || 'Unnamed';

                return (
                  <TableRow key={user.id}>
                    {/* A table cell grows to fit what is in it, so `truncate`
                        alone never cuts anything and a long email pushed
                        Status and Joined out of view. Full width with a
                        maximum of zero gives this cell whatever the other
                        columns leave and lets the text inside shorten. */}
                    <TableCell className="ps-5 w-full max-w-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarImage src={user.avatar} alt={name} />
                          <AvatarFallback>
                            {getInitials(user.name, 2) || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 space-y-1">
                          <div className="truncate font-semibold">{name}</div>
                          <div
                            className="truncate text-sm text-muted-foreground"
                            title={user.email}
                          >
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge size="sm" variant="outline">
                        {user.method === 'google' ? 'Google' : 'Password'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        size="sm"
                        variant={status.variant}
                        appearance="light"
                      >
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="pe-5 whitespace-nowrap text-secondary-foreground">
                      {user.createdAt ? (
                        <span title={formatDateTime(user.createdAt)}>
                          {timeAgo(user.createdAt)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
