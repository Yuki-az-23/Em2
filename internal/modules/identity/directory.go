package identity

import (
	"context"

	"em2.social/em2/core"
	"em2.social/em2/internal/services"
	"em2.social/em2/kernel"
)

// directory implements services.Directory in identity's own scope.
type directory struct{ scope *kernel.Scope }

func (d directory) Public(ctx context.Context, ids []string) (map[string]services.PublicPrincipal, error) {
	out := map[string]services.PublicPrincipal{}
	if len(ids) == 0 {
		return out, nil
	}
	err := d.scope.Tx(ctx, func(c kernel.Ctx) error {
		rows, err := c.DB().Query(c, `SELECT id, handle, kind, status FROM principals WHERE id = ANY($1::uuid[])`, ids)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var p services.PublicPrincipal
			var kind, status string
			if err := rows.Scan(&p.ID, &p.Handle, &kind, &status); err != nil {
				return err
			}
			p.Kind = core.PrincipalKind(kind)
			if status == "deleted" {
				p.Handle = "deleted"
			}
			out[p.ID] = p
		}
		return rows.Err()
	})
	return out, err
}
