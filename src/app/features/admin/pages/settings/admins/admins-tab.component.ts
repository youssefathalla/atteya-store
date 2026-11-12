import {
  Component,
  computed,
  inject,
  OnInit,
  PLATFORM_ID,
  resource,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { email, form, maxLength, required, submit } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { signalCollection } from '@shared/utils/firebase/firestore-signals';
import { TemplateTypeDirective } from '@shared/directives/template-type/template-type.directive';
import { SelectInputComponent } from '@shared/ui/forms/select-input/select-input.component';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { ReusableTable } from '@shared/ui/reusable-table/reusable-table.component';
import { TableColumn } from '@shared/ui/reusable-table/table.model';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { AdminTableRow, TeamRole } from '../models/admin-role.model';
import { AdminRoleDialogService } from '../services/admin-role-dialog.service';
import { AdminRolesService } from '../services/admin-roles.service';
import {
  describeRoleChange,
  formatAuditWhen,
  roleActionError,
  toAdminTableRow,
} from '../utils/admin-role.utils';

@Component({
  selector: 'app-admins-tab',
  host: { class: 'block w-full' },
  imports: [
    MatButtonModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    SharedIconModule,
    SelectInputComponent,
    TextInputComponent,
    ReusableTable,
    SkeletonComponent,
    TemplateTypeDirective,
  ],
  templateUrl: './admins-tab.component.html',
})
export class AdminsTabComponent implements OnInit {
  readonly #roles = inject(AdminRolesService);
  readonly #dialogs = inject(AdminRoleDialogService);
  readonly #snackbar = inject(SnackbarService);
  readonly #seo = inject(SeoService);
  readonly #platformId = inject(PLATFORM_ID);

  ngOnInit(): void {
    this.#seo.setPageMetadata({
      title: 'Team | Atteya Admin',
      description: 'Choose who can manage the Atteya store, as Admin or Staff.',
      noindex: true,
    });
  }

  readonly #isGranting = signal(false);
  readonly #removingUid = signal<string | null>(null);
  private readonly removeCell = viewChild<TemplateRef<unknown>>('removeCell');

  readonly roleOptions: readonly { readonly id: TeamRole; readonly label: string }[] = [
    { id: 'staff', label: 'Staff (everything except deleting orders and this page)' },
    { id: 'admin', label: 'Admin (everything)' },
  ];

  readonly emailModel = signal<{ email: string; role: TeamRole }>({ email: '', role: 'staff' });
  readonly grantForm = form(this.emailModel, (path) => {
    required(path.email, { message: 'Enter an email address.' });
    email(path.email, { message: 'Enter a valid email address.' });
    maxLength(path.email, 254, { message: 'That email address is too long.' });
  });

  readonly adminsResource = resource({
    loader: async () => {
      if (!isPlatformBrowser(this.#platformId)) return [];
      return this.#roles.listAdmins();
    },
  });

  readonly #auditLogs = signalCollection(this.#roles.auditLogsQuery());

  readonly isGranting = this.#isGranting.asReadonly();
  readonly removingUid = this.#removingUid.asReadonly();
  readonly sampleRow: AdminTableRow = {
    id: '',
    email: '',
    role: 'staff',
    roleLabel: '',
    since: '',
    grantedBy: '',
    action: '',
  };

  readonly rows = computed(() => (this.adminsResource.value() ?? []).map(toAdminTableRow));
  readonly adminCount = computed(() => this.rows().filter((row) => row.role === 'admin').length);
  readonly loadError = computed(() => {
    const error = this.adminsResource.error();
    return error ? roleActionError(error) : '';
  });
  readonly showSkeleton = computed(() => this.adminsResource.isLoading() && !this.adminsResource.hasValue());
  readonly columns = computed((): TableColumn<AdminTableRow>[] => {
    const base: TableColumn<AdminTableRow>[] = [
      { key: 'email', label: 'Email', sortable: true },
      { key: 'roleLabel', label: 'Role', sortable: true },
      { key: 'since', label: 'Since', sortable: true },
      { key: 'grantedBy', label: 'Given by', sortable: true },
    ];
    const removeCell = this.removeCell();
    if (removeCell) {
      base.push({ key: 'action', label: 'Action', sortable: false, customCellTpl: removeCell });
    }
    return base;
  });
  readonly changes = computed(() =>
    (this.#auditLogs() ?? []).flatMap((entry) =>
      entry
        ? [
            {
              id: entry.id,
              summary: describeRoleChange(entry),
              when: formatAuditWhen(entry.at),
            },
          ]
        : [],
    ),
  );
  readonly changesLoading = computed(() => this.#auditLogs() === undefined);

  onGrant(event: Event): void {
    event.preventDefault();
    if (this.#isGranting()) return;

    void submit(this.grantForm, async () => {
      const email = this.emailModel().email.trim().toLowerCase();
      const role = this.emailModel().role;
      const label = role === 'admin' ? 'Admin' : 'Staff';
      this.#isGranting.set(true);
      try {
        const result = await this.#roles.setUserRole(email, role);
        if (result.changed) {
          this.#snackbar.success(`${email} can manage the store now, as ${label}.`);
          this.emailModel.set({ email: '', role: 'staff' });
        } else {
          this.#snackbar.info(`That person is already ${label}.`);
        }
        this.adminsResource.reload();
      } catch (error: unknown) {
        this.#snackbar.error(roleActionError(error));
      } finally {
        this.#isGranting.set(false);
      }
    });
  }

  /** The only admin can't be made Staff or removed (the server refuses it too). */
  isOnlyAdmin(row: AdminTableRow): boolean {
    return row.role === 'admin' && this.adminCount() <= 1;
  }

  async changeRole(row: AdminTableRow, to: TeamRole): Promise<void> {
    if (this.#removingUid() || !this.#hasEmail(row) || row.role === to) return;
    if (!(await this.#dialogs.confirmChange(row.email, to))) return;
    await this.#save(row, to, `${row.email} is ${to === 'admin' ? 'an Admin' : 'Staff'} now.`);
  }

  async removeAdmin(row: AdminTableRow): Promise<void> {
    if (this.#removingUid() || !this.#hasEmail(row)) return;
    if (!(await this.#dialogs.confirmRemove(row.email))) return;
    await this.#save(row, 'user', `${row.email} can no longer manage the store.`);
  }

  #hasEmail(row: AdminTableRow): boolean {
    return !!row.email && row.email !== 'No email on the account';
  }

  async #save(row: AdminTableRow, role: TeamRole | 'user', done: string): Promise<void> {
    this.#removingUid.set(row.id);
    try {
      const result = await this.#roles.setUserRole(row.email, role);
      if (result.changed) {
        this.#snackbar.success(done);
      } else {
        this.#snackbar.info('Nothing changed. The list is up to date now.');
      }
      this.adminsResource.reload();
    } catch (error: unknown) {
      this.#snackbar.error(roleActionError(error));
    } finally {
      this.#removingUid.set(null);
    }
  }
}
