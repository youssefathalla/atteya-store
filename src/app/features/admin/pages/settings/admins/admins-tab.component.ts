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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SeoService } from '@core/services/seo';
import { SnackbarService } from '@core/services/snack-bar/snack-bar.service';
import { signalCollection } from '@shared/utils/firebase/firestore-signals';
import { TemplateTypeDirective } from '@shared/directives/template-type/template-type.directive';
import { TextInputComponent } from '@shared/ui/forms/text-input/text-input.component';
import { SharedIconModule } from '@shared/ui/mat-icon';
import { ReusableTable } from '@shared/ui/reusable-table/reusable-table.component';
import { TableColumn } from '@shared/ui/reusable-table/table.model';
import { SkeletonComponent } from '@shared/ui/skeleton';
import { AdminTableRow } from '../models/admin-role.model';
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
    MatProgressSpinnerModule,
    SharedIconModule,
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
      title: 'Admins | Atteya Admin',
      description: 'Choose who can manage the Atteya store.',
      noindex: true,
    });
  }

  readonly #isGranting = signal(false);
  readonly #removingUid = signal<string | null>(null);
  private readonly removeCell = viewChild<TemplateRef<unknown>>('removeCell');

  readonly emailModel = signal({ email: '' });
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
    since: '',
    grantedBy: '',
    action: '',
  };

  readonly rows = computed(() => (this.adminsResource.value() ?? []).map(toAdminTableRow));
  readonly canRemove = computed(() => this.rows().length > 1);
  readonly loadError = computed(() => {
    const error = this.adminsResource.error();
    return error ? roleActionError(error) : '';
  });
  readonly showSkeleton = computed(
    () => this.adminsResource.isLoading() && !this.adminsResource.hasValue(),
  );
  readonly columns = computed((): TableColumn<AdminTableRow>[] => {
    const base: TableColumn<AdminTableRow>[] = [
      { key: 'email', label: 'Email', sortable: true },
      { key: 'since', label: 'Admin since', sortable: true },
      { key: 'grantedBy', label: 'Granted by', sortable: true },
    ];
    const removeCell = this.removeCell();
    if (this.canRemove() && removeCell) {
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
      this.#isGranting.set(true);
      try {
        const result = await this.#roles.setUserRole(email, 'admin');
        if (result.changed) {
          this.#snackbar.success(`${email} can manage the store now.`);
          this.emailModel.set({ email: '' });
        } else {
          this.#snackbar.info('That person is already an admin.');
        }
        this.adminsResource.reload();
      } catch (error: unknown) {
        this.#snackbar.error(roleActionError(error));
      } finally {
        this.#isGranting.set(false);
      }
    });
  }

  async removeAdmin(row: AdminTableRow): Promise<void> {
    if (this.#removingUid() || !row.email || row.email === 'No email on the account') return;
    const confirmed = await this.#dialogs.confirmRemove(row.email);
    if (!confirmed) return;

    this.#removingUid.set(row.id);
    try {
      const result = await this.#roles.setUserRole(row.email, 'user');
      if (result.changed) {
        this.#snackbar.success(`${row.email} can no longer manage the store.`);
      } else {
        this.#snackbar.info('That person is not an admin.');
      }
      this.adminsResource.reload();
    } catch (error: unknown) {
      this.#snackbar.error(roleActionError(error));
    } finally {
      this.#removingUid.set(null);
    }
  }
}
